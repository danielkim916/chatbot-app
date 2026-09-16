import React, { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { completedHistory, consumeStream, remarkCitations, safeLink } from './chat.mjs';

function Icon({ name, ...props }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="m6 12 6-6 6 6M12 6v13" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18" /></>,
    spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
    moon: <path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></>,
    retry: <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    link: <path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7" />,
    down: <path d="m6 10 6 6 6-6" />,
    check: <path d="m5 12 4 4L19 6" />
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

function Answer({ message }) {
  const sources = message.sources || [];
  const transform = (url) => {
    const citation = /^source:(\d+)$/.exec(url);
    if (citation) return safeLink(sources.find((source) => source.id === Number(citation[1]))?.url);
    const safe = safeLink(url);
    return message.webSearch && !sources.some((source) => source.url === safe) ? '' : safe;
  };
  return <Markdown
    remarkPlugins={[remarkGfm, [remarkCitations, { sources }]]}
    skipHtml
    disallowedElements={['img']}
    urlTransform={transform}
    components={{
      a: ({ href, children }) => href
        ? <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children}</a>
        : <span>{children}</span>,
      table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>
    }}
  >{message.content}</Markdown>;
}

const prompts = [
  { icon: 'globe', title: 'Explore what is new', text: 'What are the latest developments in space exploration this week?', search: true },
  { icon: 'spark', title: 'Make it make sense', text: 'Explain how large language models work using a simple analogy.', search: false },
  { icon: 'search', title: 'Compare with sources', text: 'Compare React and Svelte for a small personal website using current documentation.', search: true },
  { icon: 'plus', title: 'Find the right words', text: 'Help me turn a rough idea into a clear, friendly email. Ask me what I want to say.', search: false }
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState('');
  const [configAttempt, setConfigAttempt] = useState(0);
  const [model, setModel] = useState('');
  const [mode, setMode] = useState('standard');
  const [webSearch, setWebSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showLatest, setShowLatest] = useState(false);
  const [theme, setTheme] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const atBottom = useRef(true);
  const activeModel = config?.availableModels.find((option) => option.value === model);
  const maxMessage = config?.limits.maxMessageLength || 12000;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    setConfigError('');
    async function load() {
      try {
        const response = await fetch('/api/chat', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
          cache: 'no-store'
        });
        if (!response.ok) throw new Error('The model list is unavailable. Please try again.');
        const data = await response.json();
        if (!Array.isArray(data.availableModels) || !data.availableModels.length || !data.search || !data.limits) {
          throw new Error('The chat service needs to be updated. Please reload shortly.');
        }
        setConfig(data);
        setModel(data.defaultModel);
      } catch (error) {
        if (!controller.signal.aborted) setConfigError(error.message);
      }
    }
    load();
    return () => controller.abort();
  }, [configAttempt]);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (activeModel?.supportsSarcastic === false) setMode('standard');
  }, [activeModel]);
  useEffect(() => {
    if (atBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const updateMessage = (id, patch) => setMessages((current) => current.map((message) => message.id === id ? { ...message, ...patch } : message));

  async function sendTurn(text, retry = false) {
    if (abortRef.current || !config || !text.trim()) return;
    const base = retry ? messages.slice(0, -2) : messages;
    const useSearch = webSearch;
    const searchQuery = query.trim();
    const history = [...completedHistory(base), { role: 'user', content: text.trim() }];
    if (history.length > config.limits.maxMessages || history.reduce((size, message) => size + message.content.length, 0) > config.limits.maxContextLength) {
      setNotice('This conversation has reached its context limit. Download it, then start a new chat.');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const user = { id: crypto.randomUUID(), role: 'user', content: text.trim(), webSearch: useSearch, searchQuery };
    const answer = {
      id: crypto.randomUUID(), role: 'assistant', content: '', model: activeModel?.label || model,
      status: 'pending', stage: useSearch ? 'Searching the web...' : 'Thinking it through...',
      webSearch: useSearch, sources: []
    };
    setMessages([...base, user, answer]);
    if (!retry) setInput('');
    setBusy(true);
    setNotice('');
    atBottom.current = true;
    let content = '';
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ messages: history, model, mode, webSearch: useSearch, ...(useSearch && searchQuery ? { searchQuery } : {}) })
      });
      await consumeStream(response, (event) => {
        if (event.type === 'status') updateMessage(answer.id, { stage: event.message });
        if (event.type === 'sources') updateMessage(answer.id, { sources: event.sources, searchQuery: event.query });
        if (typeof event.content === 'string') {
          content += event.content;
          updateMessage(answer.id, { content, status: 'streaming', stage: 'Writing your answer...' });
        }
      });
      if (!content) throw new Error('The model returned no text. Try another model.');
      updateMessage(answer.id, { status: 'complete', stage: '' });
      setNotice('Response ready.');
    } catch (error) {
      const stopped = controller.signal.aborted;
      updateMessage(answer.id, { status: stopped ? 'stopped' : 'error', error: stopped ? '' : error.message, stage: '' });
      setNotice(stopped ? 'Response stopped. You can retry or ask something else.' : 'The response could not be completed.');
    } finally {
      controller.abort();
      abortRef.current = null;
      setBusy(false);
      inputRef.current?.focus({ preventScroll: true });
    }
  }

  function newChat() {
    if (messages.length && !window.confirm('Clear this conversation? Download it first if you want to keep a copy.')) return;
    setMessages([]);
    setInput('');
    setQuery('');
    setNotice('New chat started.');
    inputRef.current?.focus();
  }

  function download() {
    const text = ['# Jawon Chat', ...messages.map((message) =>
      `## ${message.role === 'user' ? 'You' : message.model}\n\n${message.content}${message.status && message.status !== 'complete' ? '\n\n[Response incomplete]' : ''}` +
      (message.sources?.length ? '\n\nSources:\n' + message.sources.map((source) => `${source.id}. ${source.title}: ${source.url}`).join('\n') : '')
    )].join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `jawon-chat-${new Date().toISOString().slice(0, 10)}.md`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Conversation downloaded to your device.');
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Answer copied.');
    } catch {
      setNotice('Clipboard access is unavailable. Select the text to copy it manually.');
    }
  }

  function choosePrompt(prompt) {
    setInput(prompt.text);
    setWebSearch(prompt.search && config?.search.enabled === true);
    inputRef.current?.focus();
  }

  return (
    <div className="workspace">
      <a className="skip-link" href="#chat-input">Skip to message</a>
      <aside className="sidebar" aria-label="Workspace">
        <a className="brand" href="https://www.jawon.kim" aria-label="Jawon's website">
          <span className="brand-mark"><Icon name="spark" /></span>
          <span>jawon<span className="brand-light"> / chat</span></span>
        </a>
        <button className="new-chat" onClick={newChat} disabled={busy}><Icon name="plus" />New conversation</button>
        <div className="sidebar-note">
          <span className="eyebrow">A space for curiosity</span>
          <h2>Good questions.<br />Thoughtful answers.</h2>
          <p>Switch perspectives with different models. Look beyond the conversation with web search.</p>
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-note"><span className="status-dot" />History lives in this tab</div>
          <p>Chats stay in page memory, not browser storage. Reloading clears them. Your model provider processes messages.</p>
          <div className="sidebar-footer">
            <span>Powered by LiteLLM</span>
            <button className="icon-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title="Change theme"><Icon name={theme === 'light' ? 'moon' : 'sun'} /></button>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="mobile-brand"><Icon name="spark" /><strong>jawon / chat</strong></div>
          <div className="model-control">
            <label htmlFor="chat-model">Your model</label>
            <select id="chat-model" value={model} onChange={(event) => setModel(event.target.value)} disabled={busy || !config}>
              {!config && <option value="">Connecting...</option>}
              {config?.availableModels.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="topbar-actions">
            <span className="session-label">챗자피티, reimagined</span>
            <button className="icon-button" onClick={download} disabled={!messages.length || busy} aria-label="Download conversation" title="Download conversation"><Icon name="download" /></button>
            <button className="icon-button mobile-new" onClick={newChat} disabled={busy} aria-label="New conversation" title="New conversation"><Icon name="plus" /></button>
            <button className="icon-button mobile-theme" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}><Icon name={theme === 'light' ? 'moon' : 'sun'} /></button>
          </div>
        </header>

        {configError && <div className="config-error" role="alert"><span>{configError}</span><button onClick={() => setConfigAttempt((value) => value + 1)}>Reconnect</button></div>}

        <div className="conversation-area">
          <div className="conversation-scroll" ref={scrollRef} onScroll={() => {
            const element = scrollRef.current;
            atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
            setShowLatest(!atBottom.current);
          }}>
            {!messages.length ? (
              <section className="welcome" aria-labelledby="welcome-heading">
                <span className="welcome-badge"><Icon name="spark" />A clearer way to think</span>
                <h1 id="welcome-heading">Think it through.<br /><span>Look it up.</span></h1>
                <p>A second perspective for your ideas, questions, and next big thing. Pick a model and make yourself at home.</p>
                <div className="prompt-grid">
                  {prompts.map((prompt) => <button key={prompt.title} className="prompt-card" onClick={() => choosePrompt(prompt)} disabled={!config}>
                    <Icon name={prompt.icon} /><strong>{prompt.title}</strong>
                    <span>{prompt.search ? 'Explore with web sources' : 'Start a conversation'}<Icon name="link" width="14" height="14" /></span>
                  </button>)}
                </div>
              </section>
            ) : (
              <section className="messages" role="log" aria-label="Conversation" aria-live="off">
                {messages.map((message, index) => (
                  <article key={message.id} className={`message message-${message.role}`} aria-label={message.role === 'user' ? 'Your message' : `${message.model} response`}>
                    <div className="message-label">{message.role === 'user' ? 'You' : <><span className="assistant-mark"><Icon name="spark" width="15" height="15" /></span>{message.model}</>}
                      {message.role === 'user' && message.webSearch && <span className="search-label"><Icon name="globe" width="12" height="12" />Web search</span>}
                    </div>
                    {message.role === 'user' ? <div className="user-text">{message.content}</div> : <>
                      {message.sources.length > 0 && <details className="sources">
                        <summary><Icon name="globe" width="15" height="15" />{message.sources.length} web {message.sources.length === 1 ? 'source' : 'sources'}<span>{message.searchQuery}</span><Icon name="down" width="14" height="14" /></summary>
                        <ol>{message.sources.map((source) => <li key={source.id}><a href={safeLink(source.url) || undefined} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                          <span className="source-number">{source.id}</span><span><strong>{source.title}</strong><small>{source.domain}</small></span><Icon name="link" width="14" height="14" />
                        </a></li>)}</ol>
                      </details>}
                      <div className="answer-text"><Answer message={message} /></div>
                      {['pending', 'streaming'].includes(message.status) && <div className="generation-status"><span className="pulse-dot" />{message.stage}</div>}
                      {message.status === 'error' && <div className="response-error" role="alert">{message.error}</div>}
                      {message.status === 'stopped' && <p className="stopped">Response stopped{message.content ? ' — partial answer kept.' : '.'}</p>}
                      {['complete', 'error', 'stopped'].includes(message.status) && <div className="message-actions">
                        {message.content && <button onClick={() => copy(message.content)}><Icon name="copy" width="14" height="14" />Copy</button>}
                        {index === messages.length - 1 && !busy && <button onClick={() => sendTurn(messages.at(-2).content, true)}><Icon name="retry" width="14" height="14" />Try again</button>}
                        {message.status === 'complete' && <span><Icon name="check" width="13" height="13" />{message.webSearch ? 'Web-assisted answer' : 'Answer complete'}</span>}
                      </div>}
                    </>}
                  </article>
                ))}
              </section>
            )}
          </div>
          {showLatest && messages.length > 0 && <button className="latest-button" onClick={() => {
            atBottom.current = true;
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            setShowLatest(false);
          }}><Icon name="down" width="16" height="16" />Latest</button>}
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={(event) => { event.preventDefault(); sendTurn(input); }}>
            <label className="sr-only" htmlFor="chat-input">Message</label>
            <textarea
              id="chat-input" ref={inputRef} rows={1} value={input} maxLength={maxMessage}
              placeholder={webSearch ? 'Ask something worth looking up...' : 'Ask anything, or think out loud...'}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                  event.preventDefault();
                  sendTurn(input);
                }
              }}
              aria-describedby="composer-help"
            />
            <div className="composer-controls">
              <div className="composer-options">
                <button type="button" className={`search-toggle ${webSearch ? 'active' : ''}`} aria-pressed={webSearch} disabled={busy || !config?.search.enabled} onClick={() => setWebSearch(!webSearch)}>
                  <Icon name="globe" width="16" height="16" />Search web<span className="toggle-track" />
                </button>
                <div className="tone-control">
                  <label className="sr-only" htmlFor="chat-tone">Response tone</label>
                  <select id="chat-tone" value={mode} onChange={(event) => setMode(event.target.value)} disabled={busy || activeModel?.supportsSarcastic === false} title={activeModel?.supportsSarcastic === false ? 'This model uses the friendly tone.' : 'Response tone'}>
                    <option value="standard">Friendly</option><option value="sarcastic">Playful</option>
                  </select>
                </div>
              </div>
              <div className="send-controls">
                <span className="character-count">{input.length > maxMessage * 0.8 ? `${input.length.toLocaleString()} / ${maxMessage.toLocaleString()}` : ''}</span>
                {busy ? <button className="send-button stop-button" type="button" onClick={() => abortRef.current?.abort()} aria-label="Stop response" title="Stop response"><Icon name="stop" /></button>
                  : <button className="send-button" type="submit" disabled={!config || !input.trim()} aria-label="Send message" title="Send message"><Icon name="arrow" /></button>}
              </div>
            </div>
            {webSearch && <div className="search-settings">
              <label htmlFor="search-query">Search query <span>(optional)</span></label>
              <input id="search-query" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={config?.search.maxQueryLength || 400} placeholder="Use my message, or enter a focused search" disabled={busy} />
              <p>Your query, or the first 400 characters of this message, goes to Tavily. Avoid sensitive information. Free search has shared limits.</p>
            </div>}
          </form>
          <div className="composer-help" id="composer-help">
            <span>AI can make mistakes. Check important answers{webSearch ? ' against the sources.' : '.'}</span>
            <span className="keyboard-hint">Enter to send · Shift + Enter for a new line</span>
          </div>
          <div className="live-notice" role="status" aria-live="polite">{notice || (busy ? 'Generating your response...' : 'Chats clear when you reload. Download to keep a copy.')}</div>
        </div>
      </main>
    </div>
  );
}
