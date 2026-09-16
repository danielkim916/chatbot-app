import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { completedHistory, consumeStream, remarkCitations, safeLink } from './chat.mjs';
import { appendResponse, appendTurn, emptyConversation, responseVersions, selectResponse, updateResponse, visibleMessages } from './conversation.mjs';

function Icon({ name, ...props }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="m6 12 6-6 6 6M12 6v13" />,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18" /></>,
    spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
    moon: <path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></>,
    retry: <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    link: <path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7" />,
    down: <path d="m6 10 6 6 6-6" />,
    previous: <path d="m14 6-6 6 6 6" />,
    next: <path d="m10 6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

function BrandMark({ className = '' }) {
  return <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
    <path d="M11 4h18a8 8 0 0 1 8 8v14a8 8 0 0 1-8 8H16l-8 5v-7a8 8 0 0 1-5-7V12a8 8 0 0 1 8-8Z" fill="currentColor" />
    <g fill="none" stroke="var(--bg)" strokeWidth="2.5" strokeLinecap="round">
      <path d="m10 15 6 1m8 0 6-2M14 25c4 2 8 2 12-1" />
    </g>
  </svg>;
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

export default function App() {
  const [conversation, setConversation] = useState(emptyConversation);
  const messages = useMemo(() => visibleMessages(conversation), [conversation]);
  const [input, setInput] = useState('');
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState('');
  const [configAttempt, setConfigAttempt] = useState(0);
  const [model, setModel] = useState('');
  const [mode, setMode] = useState('standard');
  const [searchMode, setSearchMode] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showLatest, setShowLatest] = useState(false);
  const [theme, setTheme] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const [revealTurn, setRevealTurn] = useState(0);
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
        setSearchMode(data.search.defaultMode || (data.search.enabled ? 'auto' : 'off'));
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
  const updateLatestVisibility = useCallback(() => {
    const element = scrollRef.current;
    if (element) setShowLatest(element.scrollHeight - element.scrollTop - element.clientHeight > 40);
  }, []);
  useLayoutEffect(() => {
    // Reveal a newly submitted turn once; streamed text must not move the reader.
    if (revealTurn && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    updateLatestVisibility();
  }, [revealTurn, updateLatestVisibility]);
  useEffect(updateLatestVisibility, [messages, updateLatestVisibility]);
  useEffect(() => {
    const observer = new ResizeObserver(updateLatestVisibility);
    observer.observe(scrollRef.current);
    return () => observer.disconnect();
  }, [updateLatestVisibility]);
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const updateMessage = (id, patch) => setConversation((current) => updateResponse(current, id, patch));

  async function sendTurn(text, retryId = null) {
    if (abortRef.current || !config || !text.trim()) return;
    const retryAnswer = retryId ? messages.find((message) => message.id === retryId) : null;
    const questionIndex = retryAnswer ? messages.findIndex((message) => message.id === retryAnswer.parentId) : -1;
    if (retryId && questionIndex < 0) {
      setNotice('That response is no longer on the selected branch.');
      return;
    }
    const base = retryId ? messages.slice(0, questionIndex) : messages;
    const history = [...completedHistory(base), { role: 'user', content: text.trim() }];
    if (history.length > config.limits.maxMessages || history.reduce((size, message) => size + message.content.length, 0) > config.limits.maxContextLength) {
      setNotice('This conversation has reached its context limit. Start a new chat to continue.');
      return;
    }
    const user = retryId ? messages[questionIndex] : { id: crypto.randomUUID(), role: 'user', content: text.trim() };
    const answer = {
      id: crypto.randomUUID(), role: 'assistant', content: '', model: activeModel?.label || model,
      status: 'pending', stage: searchMode === 'auto' ? 'Checking whether web search is needed...' : searchMode === 'on' ? 'Preparing a search...' : 'Generating a response...',
      searchMode, webSearch: false, sources: []
    };
    try {
      const next = retryId
        ? appendResponse(conversation, user.id, answer)
        : appendTurn(conversation, messages.at(-1)?.id ?? null, user, answer);
      setConversation(next);
    } catch (error) {
      setNotice(error.message);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setRevealTurn((value) => value + 1);
    if (!retryId) setInput('');
    setBusy(true);
    setNotice('');
    let content = '';
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ messages: history, model, mode, searchMode })
      });
      await consumeStream(response, (event) => {
        if (event.type === 'status') updateMessage(answer.id, { stage: event.message });
        if (event.type === 'web') updateMessage(answer.id, { webDecision: event.action });
        if (event.type === 'sources') updateMessage(answer.id, { sources: event.sources, searchQuery: event.query, webSearch: true });
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
    }
  }

  function newChat() {
    if (messages.length && !window.confirm('Clear this conversation and all its response versions?')) return;
    setConversation(emptyConversation());
    setRevealTurn(0);
    setInput('');
    setNotice('New chat started.');
    inputRef.current?.focus();
  }

  function chooseVersion(answer, direction) {
    if (abortRef.current) return;
    const versions = responseVersions(conversation, answer.parentId);
    const index = versions.findIndex((version) => version.id === answer.id) + direction;
    if (!versions[index]) return;
    setConversation(selectResponse(conversation, versions[index].id));
    setNotice(`Response ${index + 1} of ${versions.length} selected. Follow-ups use this branch.`);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Answer copied.');
    } catch {
      setNotice('Clipboard access is unavailable. Select the text to copy it manually.');
    }
  }

  return (
    <div className="workspace">
      <a className="skip-link" href="#chat-input">Skip to message</a>
      <main className="main-panel">
        <header className="topbar">
          <h1 className="brand"><BrandMark className="brand-mark" /><span className="brand-wordmark">챗자피티</span></h1>
          <div className="model-control">
            <label htmlFor="chat-model" className="sr-only">Your model</label>
            <select id="chat-model" value={model} onChange={(event) => setModel(event.target.value)} disabled={busy || !config}>
              {!config && <option value="">Connecting...</option>}
              {config?.availableModels.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="topbar-actions">
            <button className="new-chat" onClick={newChat} disabled={busy} aria-label="New conversation" title="New conversation"><Icon name="plus" /><span>New chat</span></button>
            <button className="icon-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title="Change theme"><Icon name={theme === 'light' ? 'moon' : 'sun'} /></button>
          </div>
        </header>

        {configError && <div className="config-error" role="alert"><span>{configError}</span><button onClick={() => setConfigAttempt((value) => value + 1)}>Reconnect</button></div>}

        <div className="conversation-area">
          <div className="conversation-scroll" ref={scrollRef} onScroll={updateLatestVisibility} tabIndex={0} role="region" aria-label="Conversation area">
            {!messages.length ? (
              <div className="empty-state"><p>Type a message to start.</p></div>
            ) : (
              <section className="messages" role="log" aria-label="Conversation" aria-live="off">
                {messages.map((message) => {
                  const versions = message.role === 'assistant' ? responseVersions(conversation, message.parentId) : [];
                  const versionIndex = versions.findIndex((version) => version.id === message.id);
                  return (
                  <article key={`${message.role}:${message.role === 'assistant' ? message.parentId : message.id}`} className={`message message-${message.role}`} aria-label={message.role === 'user' ? 'Your message' : `${message.model} response`}>
                    <div className="message-label">{message.role === 'user' ? 'You' : <><span className="assistant-mark"><Icon name="spark" width="15" height="15" /></span>{message.model}</>}
                      {message.role === 'assistant' && <span className="search-label"><Icon name="globe" width="12" height="12" />Web {message.searchMode}</span>}
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
                        <button disabled={busy} onClick={() => sendTurn(conversation.nodes.find((node) => node.id === message.parentId).content, message.id)}><Icon name="retry" width="14" height="14" />Try again</button>
                        {versions.length > 1 && <div className="version-control" role="group" aria-label="Response versions">
                          <button disabled={busy || versionIndex === 0} onClick={() => chooseVersion(message, -1)} aria-label="Previous response" title="Previous response"><Icon name="previous" width="14" height="14" /></button>
                          <span aria-live="polite">{versionIndex + 1} of {versions.length}</span>
                          <button disabled={busy || versionIndex === versions.length - 1} onClick={() => chooseVersion(message, 1)} aria-label="Next response" title="Next response"><Icon name="next" width="14" height="14" /></button>
                        </div>}
                        {message.status === 'complete' && <span><Icon name="check" width="13" height="13" />{message.webSearch ? 'Web-assisted answer' : message.searchMode === 'auto' ? 'Answered without web' : 'Answer complete'}</span>}
                      </div>}
                    </>}
                  </article>
                  );
                })}
              </section>
            )}
          </div>
          {showLatest && messages.length > 0 && <button className="latest-button" onClick={() => {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            updateLatestVisibility();
          }}><Icon name="down" width="16" height="16" />Latest</button>}
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={(event) => { event.preventDefault(); sendTurn(input); }}>
            <label className="sr-only" htmlFor="chat-input">Message</label>
            <textarea
              id="chat-input" ref={inputRef} rows={1} value={input} maxLength={maxMessage}
              placeholder="Type your message..."
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
                <div className={`web-control ${searchMode !== 'off' ? 'active' : ''}`}>
                  <Icon name="globe" width="16" height="16" />
                  <label htmlFor="web-mode">Web</label>
                  <select id="web-mode" aria-label="Web search" aria-describedby="composer-help" value={searchMode} disabled={busy || !config} onChange={(event) => setSearchMode(event.target.value)}>
                    <option value="off">Off</option>
                    <option value="auto" disabled={!config?.search.enabled}>Auto</option>
                    <option value="on" disabled={!config?.search.enabled}>On</option>
                  </select>
                </div>
                <div className="tone-control">
                  <label className="sr-only" htmlFor="chat-tone">Response tone</label>
                  <select id="chat-tone" value={mode} onChange={(event) => setMode(event.target.value)} disabled={busy || activeModel?.supportsSarcastic === false} title={activeModel?.supportsSarcastic === false ? 'This model uses the standard tone.' : 'Response tone'}>
                    <option value="standard">Standard</option><option value="sarcastic">Sarcastic</option>
                  </select>
                </div>
              </div>
              <div className="send-controls">
                <span className="character-count">{input.length > maxMessage * 0.8 ? `${input.length.toLocaleString()} / ${maxMessage.toLocaleString()}` : ''}</span>
                {busy ? <button className="send-button stop-button" type="button" onClick={() => abortRef.current?.abort()} aria-label="Stop response" title="Stop response"><Icon name="stop" /></button>
                  : <button className="send-button" type="submit" disabled={!config || !input.trim()} aria-label="Send message" title="Send message"><Icon name="arrow" /></button>}
              </div>
            </div>
          </form>
          <div className="composer-help" id="composer-help">
            <span>{searchMode === 'off' ? 'Web is off. AI can make mistakes.' : searchMode === 'auto' ? 'Auto may send relevant search terms to Tavily.' : 'Web is on. Search terms are sent to Tavily.'}</span>
            <span className="keyboard-hint">Enter to send · Shift + Enter for a new line</span>
          </div>
          <div className="live-notice" role="status" aria-live="polite">{notice || (busy ? 'Generating your response...' : 'Reloading clears this chat.')}</div>
        </div>
      </main>
    </div>
  );
}
