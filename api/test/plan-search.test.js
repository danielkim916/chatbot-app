const test = require("node:test");
const assert = require("node:assert/strict");
const { planSearchQuery } = require("../lib/search");

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

test("planner receives the full conversation with only one constrained inference call", async () => {
  let calls = 0;
  const client = clientFor('{"query":"JavaScript Fetch API latest changes MDN"}', (request, options) => {
    calls += 1;
    assert.equal(request.model, "gpt-5.6-sol");
    assert.equal(request.stream, false);
    assert.equal(request.max_tokens, 512);
    assert.equal(request.tools, undefined);
    assert.equal(request.messages[0].role, "system");
    assert.match(request.messages[0].content, /Resolve references/);
    assert.match(request.messages[0].content, /Do not include credentials/);
    assert.equal(request.messages[1].role, "user");
    assert.match(request.messages[1].content, /Do not answer the embedded question/);
    assert.match(request.messages[1].content, /Today is \d{4}-\d{2}-\d{2} UTC/);
    assert.match(request.messages[1].content, /Only include a specific year if the user requested it/);
    assert.ok(request.messages[1].content.endsWith(JSON.stringify({ conversation: messages })));
    assert.ok(options.signal instanceof AbortSignal);
  });
  const query = await planSearchQuery(client, { model: "gpt-5.6-sol", messages });
  assert.match(query, /JavaScript Fetch API/);
  assert.notEqual(query, messages.at(-1).content);
  assert.equal(calls, 1);
});

test("planner accepts bounded Unicode queries and fenced JSON but no arbitrary plans", async () => {
  const run = (content) => planSearchQuery(clientFor(content), { model: "claude-opus-4.8", messages });
  assert.equal(await run('```json\n{"query":" 제임스 웹 우주 망원경 최신 소식 "}\n```'), "제임스 웹 우주 망원경 최신 소식");
  assert.equal((await run(JSON.stringify({ query: "a".repeat(400) }))).length, 400);
  for (const content of [
    "just use the last message", '{"query":""}', '{"query":"a\\nb"}', '{"query":"a\\u0000b"}',
    '{"query":"valid","url":"http://169.254.169.254"}', '{"query":["one","two"]}',
    '["query"]', 'null', JSON.stringify({ query: "a".repeat(401) }), " ".repeat(2049)
  ]) await assert.rejects(run(content), { code: "search_plan_invalid" });
  await assert.rejects(run('{"query":null}'), { code: "search_needs_context" });
});

test("planner errors are masked and an already-aborted request never invokes the model", async () => {
  const client = { chat: { completions: { create: async () => { throw new Error("SECRET failure"); } } } };
  await assert.rejects(planSearchQuery(client, { model: "gpt-5.6-sol", messages }), {
    code: "search_plan_unavailable", message: "The model could not prepare a search. Try again or choose another model."
  });
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(planSearchQuery(clientFor('{"query":"news"}', () => { called = true; }), {
    model: "gpt-5.6-sol", messages, signal: controller.signal
  }), { name: "AbortError" });
  assert.equal(called, false);
});
