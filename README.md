# Chatjapiti

[chat.jawon.kim](https://chat.jawon.kim) is a small, multi-model chatbot with streaming answers and opt-in, cited web search. React and an Express API run behind Nginx on an Ubuntu VM. **LiteLLM remains the model gateway.**

## What it does

- Choose GPT 5.6 Sol (default), Terra, Luna, or Claude Opus 4.8, in that order.
- Turn on **Search web** to let the selected model plan one focused query from the conversation, retrieve keyless Tavily results, then answer with citations. There is no manual query field; search remains explicitly opt-in.
- Use **Standard** or **Sarcastic** tone. Sarcastic is sassy, dry, and mock-exasperated while still helpful; Claude retains its existing Standard-only setting.
- View numbered sources, stream Markdown, stop a response, retry with different settings, or copy an answer.
- Use a compact header, model selector, new-chat button, and light/dark switch. There is no sidebar, promotional copy, or conversation export.
- Read freely while responses stream. The page reveals each new turn once, then preserves your scroll position and focus. **Latest** jumps down once; it does not enable automatic following.
- Keep conversation history in page memory only; reloading or starting a new chat clears it. Only completed turns are sent as subsequent context.

```text
Browser -> Nginx -> Node API :3001 -> LiteLLM :4000 -> model provider
                         |
                         +-> Tavily keyless search (only when opted in)
```

The UI never receives API credentials. Search results are snippets, not full-page verification. Citations identify retrieved sources, not a guarantee that every generated claim is correct.

## Run locally

Use Node.js 22.12+ and npm.

```bash
cd api
npm ci
cp .env.example .env
# Edit .env with your existing LiteLLM endpoint and key.
npm start
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. Vite proxies `/api` to `127.0.0.1:3001`. `CHAT_ORIGIN` must match the browser origin exactly. Never put provider keys in `VITE_*` variables.

## Configuration

`api/.env` is ignored by Git and loaded only by the API. The process environment takes precedence. The tracked `.env.example` contains safe placeholders.

| Setting | Default / meaning |
| --- | --- |
| `LITELLM_ENDPOINT`, `LITELLM_API_KEY` | Required existing LiteLLM URL and key |
| `LITELLM_MODEL` | `Label:model-id;Label:model-id` list; first entry is default. A single model ID also works. |
| `HOST`, `PORT` | `127.0.0.1`, `3001`; do not expose the adapter directly |
| `CHAT_ORIGIN` | `http://localhost:3000`; systemd sets the production origin |
| `WEB_SEARCH_ENABLED` | `true`; set `false` to disable search without disabling chat |
| `CHAT_DAILY_LIMIT` | 300 accepted requests per UTC day, shared across the site |
| `SEARCH_DAILY_LIMIT` | 80 search-enabled requests per UTC day, shared across the site |
| `CHAT_PER_MINUTE` | 10 requests per client IP per fixed minute |
| `CHAT_CONCURRENCY` | 3 globally; at most one in-flight request per IP |
| `CHAT_TIMEOUT_MS` | 120000 overall; query planning has a 20-second deadline and Tavily has a 12-second deadline |
| `CHAT_STATE_FILE` | `~/.local/state/chatbot-api/budget.json`; systemd uses `/var/lib/chatbot-api/budget.json` |

Daily quotas are reserved **before** contacting providers, including failed or canceled calls. One search-enabled request can make two model calls (query planning, then the answer) and one search call; the quotas count accepted user requests, not model calls. Planning is capped at 512 output tokens and answering at 4,096. Quotas persist atomically across process restarts; corrupt/unwritable state fails closed. Only a date and counts are stored, not questions, IPs, or answers. Minute limits are in memory. **Run exactly one API process**; multi-instance deployment requires a shared atomic quota store.

These are modest public-demo limits, not account-level authentication or a billing guarantee. Shared IPs share a quota; distributed clients can bypass IP limits but not the site's persisted daily caps. Use authentication and provider-side spending limits before offering larger quotas.

The example LiteLLM mappings in `deploy/litellm.example.yaml` document the current four UI models without secrets. Existing production mappings may include additional compatibility aliases. Do not overwrite the live LiteLLM configuration with this example or commit its actual master key/database URL.

## How search works

1. The user opts in for that turn. Search is off initially.
2. The server asks the selected model, through LiteLLM, to interpret the full bounded conversation and return one JSON search query. For example, "search that for the latest" after discussing the James Webb Space Telescope should produce a telescope-news query, not a search for those literal words. The UI shows a brief preparation status, not the model's internal reasoning.
3. The server validates the plan: exactly one query, at most 400 characters, no control characters or additional execution parameters. An unclear topic asks the user to clarify; malformed plans or planner failures do not fall back to blindly searching the latest message. Client-provided `searchQuery` fields are ignored.
4. Only the planned query goes to the fixed `https://api.tavily.com/search` endpoint with `X-Tavily-Access-Mode: keyless`. Up to five valid, deduplicated public source URLs and 1,800-character snippets per source are accepted. The total upstream response is limited to 1 MiB. No redirects, arbitrary fetch endpoint, images, crawling, or extraction are enabled.
5. The server sends structured, explicitly untrusted reference data to the chosen model through LiteLLM. The system prompt requests `[1](source:1)` citations; the browser also accepts plain `[1]` markers outside code/links, resolving only IDs of actual retrieved sources. Follow-up context retains source URLs, and the source panel identifies the planned query.
6. Failure, exhaustion, empty results, or timeout produces a visible error, not a silent fallback pretending to have researched an answer. Turn search off for an ordinary answer. Stopping cancels planning, search, or answer generation as appropriate.

[Tavily keyless access](https://docs.tavily.com/documentation/keyless) requires no account/key but is rate-limited with no documented numeric allowance or availability guarantee. The site's 80/day cap is **our** cap, not a promised provider allocation. Generated queries may contain terms from earlier turns and are disclosed to Tavily; the full conversation stays with the existing model provider, not the search provider. The planner is instructed to omit unnecessary private information, but this is not guaranteed anonymization. Do not enable search for confidential discussions.

## Boundaries and limitations

- Only allowlisted models and alternating user/assistant text messages are accepted. System/developer/tool roles and client-supplied tool execution are not supported. Unexpected message fields are discarded.
- No shell, local files, database queries, arbitrary URL fetches, or MCP connections are exposed to the model. Retrieved text is never promoted to a system message.
- Search and generated content are untrusted. React escapes text, raw HTML and images are disabled, active/local links are filtered, and web-assisted answer links are restricted to the retrieved source set. Links open with no referrer.
- Request size, context, query length, result size, output size, time, concurrency, and daily budgets are bounded. Disconnecting or stopping aborts upstream work where supported; it cannot undo provider usage already incurred.
- Provider exceptions are not relayed to the browser. Application warnings log a request ID and error code, not message bodies, keys, or raw upstream responses. LiteLLM, Nginx, and upstream providers have their own logging/retention policies.
- These controls limit consequences; **they do not guarantee immunity to prompt injection, jailbreaks, misinformation, or abuse**. Search evidence may itself contain malicious or false text.

There is no new conversation database, authentication system, autonomous tool loop, or external analytics. The retired Azure Functions/SWA implementation is in Git history; this branch now has one supported runtime: the VM's Node API.

## VM deployment

| Component | Location |
| --- | --- |
| App source | `/home/danielkim/chatbot-app` |
| API credentials | `api/.env` (not tracked) |
| Live frontend | `frontend/dist` |
| API unit | `/etc/systemd/system/chatbot-api.service` |
| Nginx site | `/etc/nginx/sites-available/chat.jawon.kim` |
| Usage counts | `/var/lib/chatbot-api/budget.json` |
| LiteLLM | Existing `litellm.service`; unchanged by app deployments |

The templates under `deploy/` are specific to this VM; adjust paths/user/domain for another host. The systemd unit runs as `danielkim`, starts at boot, restarts on failure, binds localhost, makes application files read-only, and restricts access to unrelated private directories.

For the initial migration from PM2, ensure no other process owns port 3001. Stop/remove **only** the old `chatbot-api` PM2 entry, save the remaining PM2 list, install the service template, run `systemctl daemon-reload`, and enable/start `chatbot-api.service`. Do not resurrect the old PM2 copy afterward.

For an update, keep a rollback copy of the previous source and `frontend/dist`, then:

```bash
cd /home/danielkim/chatbot-app
git pull --ff-only
npm ci --prefix api
npm ci --prefix frontend
npm test --prefix api
npm test --prefix frontend
npm run build --prefix frontend -- --outDir dist-next
npm run test:e2e --prefix frontend
# Publish assets before HTML; retain older hashed assets for already-open tabs.
rsync -a frontend/dist-next/assets/ frontend/dist/assets/
rsync -a --delay-updates --exclude=assets/ frontend/dist-next/ frontend/dist/
sudo systemctl restart chatbot-api
curl --fail http://127.0.0.1:3001/api/health
```

When changing Nginx, install `deploy/nginx-chat.conf` at the site path, run `sudo nginx -t`, then reload Nginx. It preserves TLS and streaming while adding CSP, no-referrer, clickjacking protection, request bounds, and appropriate asset caching. Other websites and LiteLLM are not modified.

```bash
systemctl status chatbot-api --no-pager
journalctl -u chatbot-api --since '10 minutes ago' --no-pager
```

`GET /api/health` checks the adapter, **not** model-provider or Tavily availability. Validate a real chat and a search-enabled chat after deployment. To roll back, restore the prior frontend and API source/dependencies, restart the appropriate previous process manager, and restore the previous Nginx site if it changed. Never run PM2 and systemd copies on the same port.

## API and checks

`GET /api/chat` returns model choices, search capability and input limits. `POST /api/chat` accepts:

```json
{
  "messages": [{"role": "user", "content": "Explain the Fetch API."}],
  "model": "gpt-5.6-sol",
  "mode": "standard",
  "webSearch": true
}
```

The SSE stream emits `meta`, `status` (`planning`, `searching`, `thinking`), and `sources` (including the planned `query`) objects, `{ "content": "..." }` deltas, and `data: [DONE]` only after successful completion. With search off there is no planning/search call. Stream failures emit `{ "error": "...", "code": "...", "requestId": "..." }` with no completion marker. Validate completion, not HTTP 200 alone.

```bash
npm test --prefix api
npm test --prefix frontend
cd frontend
npx playwright install chromium
npm run test:e2e
```

Node tests exercise validation, persistent quotas, context-aware query planning, fixed search routing, data bounds, stream errors and cancellation. Playwright uses mocked APIs and incremental streams for deterministic desktop/mobile checks, including preserved reading position, without spending provider credits. CI runs these checks on pushes/PRs; it does **not** deploy production or need API credentials.

Built by Jawon Kim. MIT licensed.
