import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeStream, completedHistory, remarkCitations, safeLink } from '../src/chat.mjs';

function response(text, chunkSize = 1) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    }
  }), { headers: { 'Content-Type': 'text/event-stream' } });
}

test('SSE parser preserves split Unicode, JSON, CRLF and multiple events', async () => {
  const events = [];
  await consumeStream(response(': heartbeat\r\n\r\ndata: {"content":"안녕 🌍"}\r\n\r\ndata: {"content":" World"}\n\ndata: [DONE]\n\n'), (event) => events.push(event));
  assert.deepEqual(events, [{ content: '안녕 🌍' }, { content: ' World' }]);
});

test('SSE requires a completion marker and surfaces error frames', async () => {
  await assert.rejects(consumeStream(response('data: {"content":"partial"}\n\n'), () => {}), /ended before/);
  await assert.rejects(consumeStream(response('data: {"error":"Search quota reached"}\n\n'), () => {}), /Search quota/);
  await assert.rejects(consumeStream(Response.json({ error: 'Too many requests' }, { status: 429 }), () => {}), /Too many/);
  await assert.rejects(consumeStream(new Response('<html>Error</html>'), () => {}), /did not return a chat stream/);
  await assert.rejects(consumeStream(new Response('<html>Error</html>', { status: 502 }), () => {}), /unavailable \(502\)/);
  await assert.rejects(consumeStream(response('data: invalid\n\n'), () => {}), /malformed/);
  await assert.rejects(consumeStream(response('data: null\n\n'), () => {}), /invalid event/);
});

test('follow-ups retain actual source URLs rather than ambiguous per-turn citation IDs', () => {
  const history = completedHistory([
    { role: 'user', content: 'Question' },
    { role: 'assistant', content: 'Answer [1](source:1)', status: 'complete', sources: [{ id: 1, url: 'https://example.org/' }] }
  ]);
  assert.equal(history[1].content, 'Answer [1](https://example.org/)\n\nSources for this response:\n[1] https://example.org/');
});

test('bare citations are linked only to retrieved sources and never inside code or links', () => {
  const tree = { type: 'root', children: [
    { type: 'paragraph', children: [{ type: 'text', value: 'Known [1] and unknown [9].' }] },
    { type: 'code', value: 'array[1]' },
    { type: 'inlineCode', value: 'array[1]' },
    { type: 'link', url: 'https://example.org/', children: [{ type: 'text', value: '[1]' }] }
  ] };
  remarkCitations({ sources: [{ id: 1, url: 'https://example.org/' }] })(tree);
  assert.deepEqual(tree.children[0].children, [
    { type: 'text', value: 'Known ' },
    { type: 'link', url: 'source:1', children: [{ type: 'text', value: '[1]' }] },
    { type: 'text', value: ' and unknown [9].' }
  ]);
  assert.equal(tree.children[1].value, 'array[1]');
  assert.equal(tree.children[2].value, 'array[1]');
  assert.deepEqual(tree.children[3].children, [{ type: 'text', value: '[1]' }]);
});

test('only completed turns become subsequent model history', () => {
  assert.deepEqual(completedHistory([
    { role: 'user', content: 'First' }, { role: 'assistant', content: 'Answer', status: 'complete', sources: ['private metadata'] },
    { role: 'user', content: 'Second' }, { role: 'assistant', content: 'Partial', status: 'error' }
  ]), [{ role: 'user', content: 'First' }, { role: 'assistant', content: 'Answer' }]);
});

test('rendered links exclude active schemes and local endpoints', () => {
  assert.equal(safeLink('https://example.org/news'), 'https://example.org/news');
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'http://127.0.0.1', 'http://169.254.169.254', 'http://foo.local', 'file:///etc/passwd', 'https://user:password@example.org']) {
    assert.equal(safeLink(url), '');
  }
});
