import React, { useEffect, useRef, useState } from 'react';

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'system', content: 'New session started.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    const userMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // Call backend API
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
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

  const labelFor = 'chat-input';

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo" aria-hidden="true">🤖</span>
          <span className="title">챗자피티</span>
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
                  {m.content}
                </div>
                {kind === 'user' && <div className="avatar" aria-hidden="true">🧑</div>}
              </div>
            );
          })}
          <div ref={endRef} />
        </section>

        <form className="composer" onSubmit={handleSubmit} autoComplete="off" spellCheck={false}>
          <label htmlFor={labelFor} className="sr-only">Message</label>
          <input
            id={labelFor}
            className="input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isLoading}
            placeholder="Type your message..."
            autoComplete="off"
            aria-autocomplete="none"
            autoCorrect="off"
            autoCapitalize="none"
            inputMode="text"
            name="message"
          />
          <button className="send" type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? <span className="spinner" aria-label="Sending" /> : 'Send'}
          </button>
        </form>
      </main>
    </div>
  );
}