import React, { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  return (
    <Markdown remarkPlugins={[remarkGfm]}>
      {content}
    </Markdown>
  );
}

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'system', content: 'New session started.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState('sarcastic');
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

    // Call backend API
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, mode }),
      });

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
          <span className="title">챗자피티</span>
        </div>
        <div className="mode-picker">
          <select
            value={mode}
            onChange={e => setMode(e.target.value)}
            disabled={isLoading}
            aria-label="Chat mode"
          >
            <option value="standard">Standard</option>
            <option value="sarcastic">Sarcastic</option>
          </select>
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