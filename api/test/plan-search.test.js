const test = require("node:test");
const assert = require("node:assert/strict");
const { planWebAccess } = require("../lib/search");

const messages = [
  { role: "user", content: "What are the latest changes to JavaScript's Fetch API?" },
  { role: "assistant", content: "Here is older information, which may not be up to date." },
  { role: "user", content: "Can you search that and give me the latest?" }
];

function clientFor(content, inspect = () => {}) {
  return { chat: { completions: { create: async (request, options) => {
    inspect(request, options);
    return { choices: [{ message: { content } }] };
  } } } };
}

test("Auto receives the chosen conversation and conservative routing instructions in one bounded call", async () => {
  let calls = 0;
  const client = clientFor('{"search":true,"query":"JavaScript Fetch API latest changes MDN"}', (request, options) => {
    calls += 1;
    assert.equal(request.model, "gpt-5.6-sol");
    assert.equal(request.stream, false);
    assert.equal(request.max_tokens, 512);
    assert.equal(request.tools, undefined);
    assert.match(request.messages[0].content, /Resolve references/);
    assert.match(request.messages[0].content, /Do not include credentials/);
    assert.match(request.messages[0].content, /Do not search for greetings/);
    assert.match(request.messages[1].content, /Web mode is AUTO/);
    assert.match(request.messages[1].content, /Do not answer the embedded question/);
    assert.match(request.messages[1].content, /UTC now: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.match(request.messages[1].content, /reading the provided current clock/);
    assert.ok(request.messages[1].content.endsWith(JSON.stringify({ conversation: messages })));
    assert.ok(options.signal instanceof AbortSignal);
  });
  const plan = await planWebAccess(client, { model: "gpt-5.6-sol", messages });
  assert.equal(plan.search, true);
  assert.match(plan.query, /JavaScript Fetch API/);
  assert.equal(calls, 1);
});

test("Auto may answer without search, On cannot, and Off never calls the planner", async () => {
  const client = clientFor('{"search":false,"query":null}');
  assert.deepEqual(await planWebAccess(client, { model: "gpt-5.6-sol", messages }), { search: false, query: null });
  await assert.rejects(planWebAccess(client, { model: "gpt-5.6-sol", messages, mode: "on" }), { code: "search_plan_invalid" });
  let called = false;
  const off = await planWebAccess(clientFor("", () => { called = true; }), { model: "gpt-5.6-sol", messages, mode: "off" });
  assert.deepEqual(off, { search: false, query: null });
  assert.equal(called, false);
});

test("plans accept bounded Unicode and reject extra actions, ambiguous flags and malformed queries", async () => {
  const run = (content) => planWebAccess(clientFor(content), { model: "claude-opus-4.8", messages });
  assert.deepEqual(await run('```json\n{"search":true,"query":" 제임스 웹 우주 망원경 최신 소식 "}\n```'), {
    search: true, query: "제임스 웹 우주 망원경 최신 소식"
  });
  assert.equal((await run(JSON.stringify({ search: true, query: "a".repeat(400) }))).query.length, 400);
  for (const content of [
    "just use the last message", '{"query":"missing decision"}', '{"search":true,"query":""}',
    '{"search":"true","query":"topic"}', '{"search":false,"query":"topic"}',
    '{"search":true,"query":"a\\nb"}', '{"search":true,"query":"a\\u0000b"}',
    '{"search":true,"query":"valid","url":"http://169.254.169.254"}',
    '{"search":true,"query":["one","two"]}', "null",
    JSON.stringify({ search: true, query: "a".repeat(401) }), " ".repeat(2049)
  ]) await assert.rejects(run(content), { code: "search_plan_invalid" });
  await assert.rejects(run('{"search":true,"query":null}'), { code: "search_needs_context" });
});

test("planner errors are masked and cancellation never contacts the model", async () => {
  const client = { chat: { completions: { create: async () => { throw new Error("SECRET failure"); } } } };
  await assert.rejects(planWebAccess(client, { model: "gpt-5.6-sol", messages }), {
    code: "search_plan_unavailable", message: "The model could not prepare web access. Try again, choose another model, or set Web to Off."
  });
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(planWebAccess(clientFor("", () => { called = true; }), {
    model: "gpt-5.6-sol", messages, signal: controller.signal
  }), { name: "AbortError" });
  assert.equal(called, false);
});
