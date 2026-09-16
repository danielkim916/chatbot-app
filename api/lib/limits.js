const fs = require("node:fs");
const path = require("node:path");
const { HttpError } = require("./config");

class UsageLimits {
  constructor(config, now = Date.now) {
    this.config = config;
    this.now = now;
    this.clients = new Map();
    this.inflight = new Set();
    this.window = 0;
    this.state = { date: new Date(now()).toISOString().slice(0, 10), chats: 0, searches: 0 };
    fs.mkdirSync(path.dirname(config.stateFile), { recursive: true, mode: 0o700 });
    try {
      if (fs.statSync(config.stateFile).size > 1024) throw new Error("Usage budget file is too large.");
      const state = JSON.parse(fs.readFileSync(config.stateFile, "utf8"));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date) ||
        !Number.isSafeInteger(state.chats) || state.chats < 0 ||
        !Number.isSafeInteger(state.searches) || state.searches < 0) {
        throw new Error("Usage budget file is invalid; restore it rather than resetting the budget silently.");
      }
      this.state = state;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.persist(this.state);
  }

  persist(state) {
    const temporary = `${this.config.stateFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporary, this.config.stateFile);
  }

  reserve(client, search = false) {
    const now = this.now();
    const window = Math.floor(now / 60000);
    if (window !== this.window) {
      this.clients.clear();
      this.window = window;
    }
    const retryAfter = 60 - Math.floor(now / 1000) % 60;
    if (this.clients.size >= 5000 && !this.clients.has(client)) {
      throw new HttpError(503, "busy", "The service is busy. Please try again shortly.", retryAfter);
    }
    const requests = this.clients.get(client) || 0;
    this.clients.set(client, requests + 1);
    if (requests >= this.config.perMinute) {
      throw new HttpError(429, "rate_limit", "Too many requests. Please wait a minute before trying again.", retryAfter);
    }
    if (this.inflight.has(client) || this.inflight.size >= this.config.concurrent) {
      throw new HttpError(429, "busy", "Another response is in progress. Please try again shortly.", 5);
    }
    this.reserveDaily(1, Number(search));
    this.inflight.add(client);
    return () => this.inflight.delete(client);
  }

  reserveSearch() {
    this.reserveDaily(0, 1);
  }

  reserveDaily(chats, searches) {
    const now = this.now();
    const date = new Date(now).toISOString().slice(0, 10);
    const state = date > this.state.date ? { date, chats: 0, searches: 0 } : this.state;
    if ((chats && state.chats >= this.config.dailyChats) || (searches && state.searches >= this.config.dailySearches)) {
      throw new HttpError(429, "daily_limit",
        searches && state.searches >= this.config.dailySearches
          ? "Today's shared web search budget is used up. Turn search off or try again after midnight UTC."
          : "Today's shared chat budget is used up. Please try again after midnight UTC.",
        Math.ceil((Date.parse(`${date}T00:00:00Z`) + 86400000 - now) / 1000));
    }
    const next = { date: state.date, chats: state.chats + chats, searches: state.searches + searches };
    try {
      // Reserve before contacting providers; one process owns this atomic, restart-persistent budget.
      this.persist(next);
    } catch {
      throw new HttpError(503, "budget_unavailable", "Usage limits are temporarily unavailable. Please try again later.");
    }
    this.state = next;
  }
}

module.exports = { UsageLimits };
