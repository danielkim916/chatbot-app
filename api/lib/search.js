const { isIP } = require("node:net");
const { HttpError, LIMITS } = require("./config");

function publicUrl(raw) {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      url.port || isIP(host) || host.startsWith("[") || !host.includes(".") ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

async function boundedJson(response) {
  if (!response.body) throw new HttpError(502, "search_invalid", "Search returned an invalid response.");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1024 * 1024) throw new HttpError(502, "search_too_large", "Search returned too much data. Try a narrower query.");
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new HttpError(502, "search_invalid", "Search returned an invalid response. Please try again.");
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

async function searchWeb(query, { signal, fetchImpl = fetch } = {}) {
  const timeout = AbortSignal.timeout(12000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await fetchImpl("https://api.tavily.com/search", {
      method: "POST",
      redirect: "error",
      signal: combined,
      headers: { "Content-Type": "application/json", "X-Tavily-Access-Mode": "keyless" },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: LIMITS.results,
        include_answer: false,
        include_raw_content: false,
        include_images: false
      })
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpError(502, "search_unavailable",
        response.status === 429
          ? "The free search provider is at its limit. Turn search off or try again later."
          : "Web search is unavailable right now. Turn search off or try again later.");
    }
    const data = await boundedJson(response);
    if (!Array.isArray(data.results)) {
      throw new HttpError(502, "search_invalid", "Web search returned no usable results. Try a different query.");
    }
    const sources = [];
    const seen = new Set();
    for (const result of data.results) {
      const url = publicUrl(result?.url);
      if (!url || seen.has(url) || typeof result.content !== "string" || !result.content.trim()) continue;
      seen.add(url);
      sources.push({
        id: sources.length + 1,
        title: typeof result.title === "string" ? result.title.slice(0, 180) : new URL(url).hostname,
        url,
        domain: new URL(url).hostname,
        content: result.content.slice(0, 1800)
      });
      if (sources.length === LIMITS.results) break;
    }
    if (!sources.length) throw new HttpError(502, "search_empty", "No usable search results were found. Try a different search query.");
    return sources;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, timeout.aborted ? "search_timeout" : "search_unavailable",
      timeout.aborted ? "Web search timed out. Try again or turn search off."
        : "Could not reach web search. Try again or turn search off.");
  }
}

module.exports = { searchWeb, publicUrl };
