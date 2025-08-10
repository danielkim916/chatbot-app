import React, { useState } from 'react';

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'system', content: '🖥️ How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSend() {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input.trim() };
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

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 20 }}>
      <h1>챗자피티 🤖</h1>
      <div
        style={{
          border: '1px solid #ccc',
          padding: 10,
          height: 400,
          overflowY: 'auto',
          marginBottom: 10,
          whiteSpace: 'pre-wrap',
        }}
      >
        {messages.map((m, i) => (
          <div key={i} style={{ margin: '10px 0', textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <strong>{m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Bot' : 'System'}:</strong> {m.content}
          </div>
        ))}
      </div>
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSend()}
        disabled={isLoading}
        style={{ width: '100%', padding: 10, fontSize: 16 }}
        placeholder="Type your message..."
      />
      <button onClick={handleSend} disabled={isLoading || !input.trim()} style={{ marginTop: 10, padding: '10px 20px' }}>
        Send
      </button>
    </div>
  );
}