import React, { useEffect, useRef, useState } from 'react';

function ThinkingBubble() {
  const [text, setText] = useState('Thinking');

  useEffect(() => {
    const thinkingStates = ['Thinking', 'Thinking.', 'Thinking..', 'Thinking...'];
    let currentState = 0;
    const interval = setInterval(() => {
      currentState = (currentState + 1) % thinkingStates.length;
      setText(thinkingStates[currentState]);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="msg assistant">
      <div className="avatar" aria-hidden="true">🤖</div>
      <div className="bubble thinking">
        {text}
      </div>
    </div>
  );
}

function MarkdownText({ content }) {
  const parseContent = (text) => {
    const parts = [];
    let key = 0;

    // First, handle code blocks (```...```) - these need to be processed at the content level
    const codeBlockRegex = /```([\s\S]*?)```/g;
    const codeBlocks = [];
    let match;
    let lastIndex = 0;

    // Find all code blocks and their positions
    while ((match = codeBlockRegex.exec(text)) !== null) {
      codeBlocks.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1].trim(),
        fullMatch: match[0]
      });
    }

    // If no code blocks were found, just parse the whole text as inline markdown
    if (codeBlocks.length === 0) {
      return parseInlineMarkdown(text);
    }

    // Process text with code blocks
    codeBlocks.forEach((block, blockIndex) => {
      // Add content before the code block
      if (block.start > lastIndex) {
        const beforeContent = text.slice(lastIndex, block.start);
        if (beforeContent.trim()) {
          const inlineContent = parseInlineMarkdown(beforeContent);
          parts.push(...inlineContent);
        }
      }

      // Add the code block
      parts.push(
        <pre key={key++} className="code-block">
          <code>{block.content}</code>
        </pre>
      );

      lastIndex = block.end;
    });

    // Add remaining content after the last code block
    if (lastIndex < text.length) {
      const remainingContent = text.slice(lastIndex);
      if (remainingContent.trim()) {
        const inlineContent = parseInlineMarkdown(remainingContent);
        parts.push(...inlineContent);
      }
    }

    return parts;
  };

  const parseInlineMarkdown = (text) => {
    const parts = [];
    let currentKey = 0;

    // Define patterns for inline markdown (including inline code)
    const patterns = [
      { regex: /`([^`]+)`/g, tag: 'code', className: 'inline-code' }, // Inline code (highest priority)
      { regex: /\*\*\*(.*?)\*\*\*/g, tag: 'strong', className: 'bold-italic' }, // Bold + Italic
      { regex: /\*\*(.*?)\*\*/g, tag: 'strong', className: 'bold' }, // Bold
      { regex: /\*(.*?)\*/g, tag: 'em', className: 'italic' }, // Italic
      { regex: /__(.*?)__/g, tag: 'u', className: 'underline' }, // Underline
      { regex: /~~(.*?)~~/g, tag: 'del', className: 'strikethrough' }, // Strikethrough
    ];

    // Find all matches and their positions
    const matches = [];
    patterns.forEach((pattern, patternIndex) => {
      let match;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          content: match[1],
          tag: pattern.tag,
          className: pattern.className,
          priority: patternIndex, // Lower number = higher priority
          fullMatch: match[0]
        });
      }
    });

    // Sort matches by start position, then by priority for overlapping matches
    matches.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return a.priority - b.priority;
    });

    // Filter out overlapping matches (keep higher priority ones)
    const filteredMatches = [];
    for (const match of matches) {
      const overlapping = filteredMatches.some(existing => 
        (match.start < existing.end && match.end > existing.start)
      );
      if (!overlapping) {
        filteredMatches.push(match);
      }
    }

    // Build the result array
    let lastEnd = 0;
    filteredMatches.forEach(match => {
      // Add text before the match
      if (match.start > lastEnd) {
        const beforeText = text.slice(lastEnd, match.start);
        // Split by line breaks and add <br> tags
        const lines = beforeText.split('\n');
        lines.forEach((line, lineIndex) => {
          if (line) parts.push(line);
          if (lineIndex < lines.length - 1) parts.push(<br key={`br-${currentKey++}`} />);
        });
      }

      // Add the formatted match
      const Tag = match.tag;
      if (match.className === 'bold-italic') {
        parts.push(
          <Tag key={`tag-${currentKey++}`} className="bold italic">
            {match.content}
          </Tag>
        );
      } else {
        parts.push(
          <Tag key={`tag-${currentKey++}`} className={match.className}>
            {match.content}
          </Tag>
        );
      }

      lastEnd = match.end;
    });

    // Add remaining text
    if (lastEnd < text.length) {
      const remainingText = text.slice(lastEnd);
      // Split by line breaks and add <br> tags
      const lines = remainingText.split('\n');
      lines.forEach((line, lineIndex) => {
        if (line) parts.push(line);
        if (lineIndex < lines.length - 1) parts.push(<br key={`br-${currentKey++}`} />);
      });
    }

    return parts.length > 0 ? parts : [text];
  };

  return <>{parseContent(content)}</>;
}

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'system', content: 'New session started.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    const userMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    setIsLoading(true);

    try {
      // Call backend API
      const response = await fetch('/api/chat?stream=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      const contentType = response.headers.get('content-type') || '';

      if (response.ok && contentType.includes('text/event-stream') && response.body) {
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let receivedAny = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const lines = part.split('\n');
            const dataLine = lines.find(l => l.startsWith('data: '));
            const eventLine = lines.find(l => l.startsWith('event: '));
            if (!dataLine) continue;

            const raw = dataLine.slice('data: '.length).trim();
            if (eventLine && eventLine.includes('done') && raw === '[DONE]') {
              break;
            }

            let delta = '';
            try {
              delta = JSON.parse(raw);
            } catch {
              delta = raw;
            }

            if (delta) {
              receivedAny = true;
              setMessages(prev => {
                if (prev.length === 0) return prev;
                const copy = prev.slice();
                const lastIdx = copy.length - 1;
                if (copy[lastIdx].role !== 'assistant') {
                  copy.push({ role: 'assistant', content: delta });
                } else {
                  copy[lastIdx] = { ...copy[lastIdx], content: (copy[lastIdx].content || '') + delta };
                }
                return copy;
              });
              if (receivedAny) setIsLoading(false);
            }
          }
        }

        setIsLoading(false);
        return;
      }

      if (!response.ok) throw new Error('API error');

      const data = await response.json();
      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
    } catch (e) {
      setMessages([...newMessages, { role: 'assistant', content: 'Error: ' + e.message }]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const labelFor = 'chat-input';

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo" aria-hidden="true">🤖</span>
          <span className="title">Chat App (Dev)</span>
        </div>
      </header>

      <main className="chat">
        <section
          className="messages"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.map((m, i) => {
            const kind = m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'system';
            return (
              <div key={i} className={`msg ${kind}`}>
                {kind !== 'user' && <div className="avatar" aria-hidden="true">{kind === 'assistant' ? '🤖' : 'ℹ️'}</div>}
                <div className="bubble">
                  <MarkdownText content={m.content} />
                </div>
                {kind === 'user' && <div className="avatar" aria-hidden="true">🧑</div>}
              </div>
            );
          })}
          {isLoading && <ThinkingBubble />}
          <div ref={endRef} />
        </section>

        <form className="composer" onSubmit={handleSubmit} autoComplete="off" spellCheck={false}>
          <label htmlFor={labelFor} className="sr-only">Message</label>
          <textarea
            ref={inputRef}
            id={labelFor}
            className="input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Type your message..."
            autoComplete="off"
            autoCorrect="on"
            autoCapitalize="none"
            name="message"
            rows={1}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
          />
          <button className="send" type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? <span className="spinner" aria-label="Sending" /> : 'Send'}
          </button>
        </form>
      </main>
    </div>
  );
}