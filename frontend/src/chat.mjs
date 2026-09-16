export function completedHistory(messages) {
  const history = [];
  for (let i = 0; i + 1 < messages.length; i += 2) {
    const [question, answer] = [messages[i], messages[i + 1]];
    if (question.role === 'user' && answer.role === 'assistant' && answer.status === 'complete') {
      const content = answer.content.replace(/\]\(source:(\d+)\)/g, (match, id) => {
        const url = safeLink(answer.sources?.find((source) => source.id === Number(id))?.url);
        return url ? `](${url})` : match;
      });
      const sources = (answer.sources || []).filter((source) => safeLink(source.url));
      const references = sources.length ? '\n\nSources for this response:\n' + sources.map((source) => `[${source.id}] ${source.url}`).join('\n') : '';
      history.push({ role: 'user', content: question.content }, { role: 'assistant', content: content + references });
    }
  }
  return history;
}

export function remarkCitations({ sources }) {
  const ids = new Set(sources.filter((source) => safeLink(source.url)).map((source) => String(source.id)));
  return (tree) => {
    function visit(node) {
      if (!node.children || ['link', 'linkReference', 'code', 'inlineCode'].includes(node.type)) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text') {
          visit(child);
          return [child];
        }
        const parts = [];
        let start = 0;
        for (const match of child.value.matchAll(/\[(\d{1,2})\]/g)) {
          if (!ids.has(match[1])) continue;
          if (match.index > start) parts.push({ type: 'text', value: child.value.slice(start, match.index) });
          parts.push({ type: 'link', url: `source:${match[1]}`, children: [{ type: 'text', value: match[0] }] });
          start = match.index + match[0].length;
        }
        if (start < child.value.length) parts.push({ type: 'text', value: child.value.slice(start) });
        return parts;
      });
    }
    visit(tree);
  };
}

export function safeLink(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      url.port || !url.hostname.includes('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname) ||
      /^[\d.]+$/.test(url.hostname) || url.hostname.startsWith('[')) return '';
    return url.href;
  } catch {
    return '';
  }
}

export async function consumeStream(response, onEvent) {
  if (!response.ok) {
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error(`The chat service is unavailable (${response.status}). Please try again shortly.`);
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('The server returned an unreadable error. Please try again shortly.');
    }
    throw new Error(data.error || `The request failed (${response.status}).`);
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
    throw new Error('The server did not return a chat stream. Please reload and try again.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 131072) throw new Error('The response exceeded the stream size limit.');
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const payload = frame.split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, '')).join('\n');
        if (!payload) continue;
        if (payload === '[DONE]') {
          await reader.cancel();
          return;
        }
        let event;
        try {
          event = JSON.parse(payload);
        } catch {
          throw new Error('The chat stream was malformed. Please try again.');
        }
        if (!event || typeof event !== 'object' || Array.isArray(event)) {
          throw new Error('The chat stream contained an invalid event. Please try again.');
        }
        if (event.error) throw new Error(event.error);
        onEvent(event);
      }
      if (done) throw new Error('The connection ended before the answer finished. Please try again.');
    }
  } finally {
    reader.releaseLock();
  }
}
