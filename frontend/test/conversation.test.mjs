import test from 'node:test';
import assert from 'node:assert/strict';
import { appendResponse, appendTurn, emptyConversation, responseVersions, selectResponse, updateResponse, visibleMessages } from '../src/conversation.mjs';
import { completedHistory } from '../src/chat.mjs';

const user = (id, content = id) => ({ id, content });
const answer = (id, content = id, status = 'complete') => ({ id, content, status, sources: [], model: 'Sol' });

test('regeneration appends 2/2 and 3/3 without replacing previous content', () => {
  let state = appendTurn(emptyConversation(), null, user('u1'), answer('a1', 'First answer'));
  state = appendResponse(state, 'u1', answer('a2', 'Second answer'));
  state = appendResponse(state, 'u1', answer('a3', 'Third answer'));
  assert.deepEqual(responseVersions(state, 'u1').map((item) => item.content), ['First answer', 'Second answer', 'Third answer']);
  assert.equal(visibleMessages(state).at(-1).id, 'a3');
  state = selectResponse(state, 'a1');
  assert.equal(visibleMessages(state).at(-1).content, 'First answer');
});

test('each response retains its own downstream branch and only the selected path is sent', () => {
  let state = appendTurn(emptyConversation(), null, user('u1', 'Question'), answer('a1', 'Original'));
  state = appendTurn(state, 'a1', user('u2', 'First branch follow-up'), answer('a2', 'First branch answer'));
  state = appendResponse(state, 'u1', answer('a1b', 'Alternative'));
  assert.deepEqual(visibleMessages(state).map((node) => node.id), ['u1', 'a1b']);
  state = appendTurn(state, 'a1b', user('u3', 'Second branch follow-up'), answer('a3', 'Second branch answer'));
  state = selectResponse(state, 'a1');
  assert.deepEqual(visibleMessages(state).map((node) => node.id), ['u1', 'a1', 'u2', 'a2']);
  const originalHistory = completedHistory(visibleMessages(state));
  assert.ok(!JSON.stringify(originalHistory).includes('Alternative'));
  assert.ok(!JSON.stringify(originalHistory).includes('Second branch'));
  state = selectResponse(state, 'a1b');
  assert.deepEqual(visibleMessages(state).map((node) => node.id), ['u1', 'a1b', 'u3', 'a3']);
  assert.ok(!JSON.stringify(completedHistory(visibleMessages(state))).includes('First branch'));
});

test('failed or stopped retries keep old successful versions and source metadata intact', () => {
  let state = appendTurn(emptyConversation(), null, user('u1'), {
    ...answer('a1', 'Cited [1](source:1)'), sources: [{ id: 1, url: 'https://example.org/' }], searchMode: 'on'
  });
  state = appendResponse(state, 'u1', answer('a2', 'Partial', 'pending'));
  state = updateResponse(state, 'a2', { status: 'stopped' });
  assert.deepEqual(completedHistory(visibleMessages(state)), []);
  state = selectResponse(state, 'a1');
  assert.equal(visibleMessages(state).at(-1).sources.length, 1);
  assert.match(completedHistory(visibleMessages(state))[1].content, /https:\/\/example.org/);
});

test('branch operations are immutable and bound saved versions without silently discarding them', () => {
  const initial = emptyConversation();
  let state = appendTurn(initial, null, user('u1'), answer('a1'));
  assert.deepEqual(initial.nodes, []);
  for (let i = 0; i < 198; i++) state = appendResponse(state, 'u1', answer(`v${i}`, ''));
  assert.equal(state.nodes.length, 200);
  assert.throws(() => appendResponse(state, 'u1', answer('overflow')), /saved-version limit/);
  assert.equal(state.nodes.length, 200);
  assert.equal(visibleMessages(selectResponse(state, 'a1')).at(-1).id, 'a1');
  assert.throws(() => selectResponse(state, 'missing'), /unavailable/);
});
