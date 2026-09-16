const ROOT = 'root';
const MAX_NODES = 200;
const MAX_TEXT = 2_000_000;

export function emptyConversation() {
  return { nodes: [], selected: {} };
}

export function visibleMessages(conversation) {
  const path = [];
  const visited = new Set();
  let parentId = null;
  let id = conversation.selected[ROOT];
  while (id) {
    const node = conversation.nodes.find((item) => item.id === id && item.parentId === parentId);
    if (!node || visited.has(id)) throw new Error('The conversation branch is inconsistent.');
    visited.add(id);
    path.push(node);
    parentId = id;
    id = conversation.selected[id];
  }
  return path;
}

function ensureCapacity(conversation, count, text = '') {
  const size = conversation.nodes.reduce((total, node) => total + node.content.length, 0);
  if (conversation.nodes.length + count > MAX_NODES || size + text.length + 48000 > MAX_TEXT) {
    throw new Error('This chat has reached its saved-version limit. Start a new chat to continue.');
  }
}

export function appendTurn(conversation, parentId, user, answer) {
  ensureCapacity(conversation, 2, user.content);
  if (parentId && !conversation.nodes.some((node) => node.id === parentId && node.role === 'assistant')) {
    throw new Error('The parent response is missing.');
  }
  return {
    nodes: [...conversation.nodes, { ...user, role: 'user', parentId }, { ...answer, role: 'assistant', parentId: user.id }],
    selected: { ...conversation.selected, [parentId ?? ROOT]: user.id, [user.id]: answer.id }
  };
}

export function appendResponse(conversation, userId, answer) {
  ensureCapacity(conversation, 1);
  if (!conversation.nodes.some((node) => node.id === userId && node.role === 'user')) {
    throw new Error('The question for this response is missing.');
  }
  return {
    nodes: [...conversation.nodes, { ...answer, role: 'assistant', parentId: userId }],
    selected: { ...conversation.selected, [userId]: answer.id }
  };
}

export function responseVersions(conversation, userId) {
  return conversation.nodes.filter((node) => node.parentId === userId && node.role === 'assistant');
}

export function selectResponse(conversation, id) {
  const answer = conversation.nodes.find((node) => node.id === id && node.role === 'assistant');
  if (!answer) throw new Error('That response version is unavailable.');
  return { ...conversation, selected: { ...conversation.selected, [answer.parentId]: answer.id } };
}

export function updateResponse(conversation, id, patch) {
  return { ...conversation, nodes: conversation.nodes.map((node) => node.id === id ? { ...node, ...patch } : node) };
}
