const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { UsageLimits } = require("../lib/limits");

function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chat-limits-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  return { stateFile: path.join(directory, "budget.json"), perMinute: 3, concurrent: 2, dailyChats: 5, dailySearches: 2, ...overrides };
}

test("rate and concurrency limits cannot be bypassed by a second in-flight request", (t) => {
  const limits = new UsageLimits(fixture(t));
  const releaseA = limits.reserve("a", false);
  assert.throws(() => limits.reserve("a", false), { code: "busy" });
  const releaseB = limits.reserve("b", false);
  assert.throws(() => limits.reserve("c", false), { code: "busy" });
  releaseA();
  limits.reserve("a", false)();
  assert.throws(() => limits.reserve("a", false), { code: "rate_limit" });
  releaseB();
});

test("daily search cap persists across restarts without disabling normal chat", (t) => {
  const config = fixture(t);
  let now = Date.parse("2026-09-16T12:00:00Z");
  const first = new UsageLimits(config, () => now);
  first.reserve("a", true)();
  first.reserve("b", true)();
  const restarted = new UsageLimits(config, () => now);
  assert.throws(() => restarted.reserve("c", true), { code: "daily_limit" });
  restarted.reserve("c", false)();
  assert.equal(JSON.parse(fs.readFileSync(config.stateFile)).searches, 2);
  now += 86400000;
  restarted.reserve("a", true)();
  assert.equal(JSON.parse(fs.readFileSync(config.stateFile)).searches, 1);
});

test("global chat cap and missing budget storage fail closed", (t) => {
  const config = fixture(t, { dailyChats: 1 });
  const limits = new UsageLimits(config);
  limits.reserve("a", false)();
  assert.throws(() => limits.reserve("b", false), { code: "daily_limit" });
  const broken = new UsageLimits(fixture(t));
  broken.persist = () => { throw new Error("disk unavailable"); };
  assert.throws(() => broken.reserve("a", true), { code: "budget_unavailable" });
  assert.equal(broken.state.searches, 0);
});

test("corrupt persisted state is not silently reset", (t) => {
  const config = fixture(t);
  fs.writeFileSync(config.stateFile, '{"date":"bad","chats":-1,"searches":0}');
  assert.throws(() => new UsageLimits(config), /invalid/);
});
