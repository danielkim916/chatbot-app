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

function findModelOption(modelOptions, modelValue) {
  return modelOptions.find((option) => option.value === modelValue);
}

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'system', content: 'New session started.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState('sarcastic');
  const [modelOptions, setModelOptions] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const messagesRef = useRef(null);

  function isNearBottom() {
    const el = messagesRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  useEffect(() => {
    if (isNearBottom()) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  useEffect(() => {
    let isCancelled = false;

    async function loadChatConfig() {
      try {
        const response = await fetch('/api/chat');
        if (!response.ok) {
          throw new Error('Failed to load chat configuration');
        }

        const data = await response.json();
        if (isCancelled) {
          return;
        }

        const availableModels = Array.isArray(data.availableModels) ? data.availableModels : [];
        const defaultModel = data.defaultModel || availableModels[0]?.value || '';
        const defaultOption = findModelOption(availableModels, defaultModel);

        setModelOptions(availableModels);
        setSelectedModel(defaultModel);

        if (defaultOption && defaultOption.supportsSarcastic === false) {
          setMode('standard');
        }
      } catch {
        if (!isCancelled) {
          setModelOptions([]);
          setSelectedModel('');
        }
      }
    }

    loadChatConfig();

    return () => {
      isCancelled = true;
    };
  }, []);

  const hasModelDropdown = modelOptions.length > 0;
  const activeModelOption = findModelOption(modelOptions, selectedModel);
  const isSarcasticUnavailable = hasModelDropdown && activeModelOption?.supportsSarcastic === false;

  useEffect(() => {
    if (isSarcasticUnavailable && mode !== 'standard') {
      setMode('standard');
    }
  }, [isSarcasticUnavailable, mode]);

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
    setIsStreaming(false);

    // Scroll to bottom when user sends a new message
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, mode, model: selectedModel || undefined }),
      });

      if (!response.ok) throw new Error('API error');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.content) {
              accumulated += parsed.content;
              setIsStreaming(true);
              setMessages([...newMessages, { role: 'assistant', content: accumulated }]);
            }
          } catch (parseErr) {
            if (parseErr.message !== 'Unexpected end of JSON input') throw parseErr;
          }
        }
      }

      // Final state in case no chunks arrived
      if (!accumulated) {
        setMessages([...newMessages, { role: 'assistant', content: 'No response received.' }]);
      }
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

  const inputLabelFor = 'chat-input';
  const modeLabelFor = 'chat-mode';
  const modelLabelFor = 'chat-model';

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo" aria-hidden="true">🤖</span>
          <span className="title">챗자피티</span>
        </div>
        <div className="header-controls">
          {hasModelDropdown && (
            <div className="picker">
              <label htmlFor={modelLabelFor} className="sr-only">Chat model</label>
              <select
                id={modelLabelFor}
                className="picker-select"
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                disabled={isLoading}
                aria-label="Chat model"
              >
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="picker picker-with-info">
            <label htmlFor={modeLabelFor} className="sr-only">Chat mode</label>
            <select
              id={modeLabelFor}
              className="picker-select"
              value={mode}
              onChange={e => setMode(e.target.value)}
              disabled={isLoading || isSarcasticUnavailable}
              aria-label="Chat mode"
            >
              <option value="standard">Standard</option>
              <option value="sarcastic">Sarcastic</option>
            </select>

            {isSarcasticUnavailable && (
              <div className="info-tooltip">
                <button
                  type="button"
                  className="info-button"
                  aria-label="Why is sarcastic mode unavailable?"
                >
                  i
                </button>
                <div className="info-tooltip-content" role="tooltip">
                  Sarcastic mode isn't supported when using Anthropic models.
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="chat">
        <section
          ref={messagesRef}
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
          {isLoading && !isStreaming && <ThinkingBubble />}
          <div ref={endRef} />
        </section>

        <form className="composer" onSubmit={handleSubmit} autoComplete="off" spellCheck={false}>
          <label htmlFor={inputLabelFor} className="sr-only">Message</label>
          <textarea
            ref={inputRef}
            id={inputLabelFor}
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