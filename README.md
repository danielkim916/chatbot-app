# Chat.Jawon — General-Purpose AI Chatbot (Powered by Azure OpenAI)

**Live demo:** Coming soon at [chat.jawon.kim](http://chat.jawon.kim)  
**Repository:** Public on GitHub for transparency, learning, and open collaboration.

---

## 1. Project Overview
This project is an open-source, **general-purpose AI chatbot** similar in functionality to ChatGPT or Gemini.  
It is designed for **multi-user access**, with a scalable architecture that supports:
- Session-based conversation history
- Secure backend proxy to Azure OpenAI (never exposing API keys)
- A clean, responsive chat UI
- Easy extension for future features like authentication, long-term memory, and document retrieval.

The goal is to build an MVP that’s production-ready for basic public usage, while keeping the architecture simple enough for rapid iteration and educational purposes.

---

## 2. MVP Scope

### ✅ In Scope for MVP
- **Frontend**:  
  - React single-page app with Vite build system.  
  - Minimal chat UI with message list, input box, send button.  
  - Streams responses from backend for natural "typewriter" effect.

- **Backend**:  
  - Azure Functions-based API to proxy requests to Azure OpenAI.
  - Maintains session context in memory (per browser session).  
  - Handles basic rate-limiting and CORS.

- **Azure Integration**:  
  - Uses Azure OpenAI GPT model (e.g., `gpt-4o-mini` or `gpt-4o`).  
  - Passes system instructions + recent conversation history.

- **Deployment**:  
  - **Frontend + Backend hosted together** via Azure Static Web Apps (SWA).  
  - Backend runs as Azure Functions in `/api` folder.  
  - Domain mapped to `chat.jawon.kim` without affecting `www.jawon.kim`.

---

### 🚫 Out of Scope for MVP (Future Enhancements)
These will be designed for in future iterations:
- Google/Microsoft OAuth login
- Persistent database (CosmosDB/Postgres) for user profiles and long-term memory
- Vector-store memory and RAG (document retrieval)
- Upload documents for AI-assisted Q&A
- Content moderation filters
- Multiple chatbot personalities

---

## 3. High-Level Architecture

```
[ Browser (chat.jawon.kim) ]
  ↓
[ React Frontend (Azure SWA) ]
  ↓
[ Backend (Azure Functions API) -- proxy, session state, key storage ]
  ↓
[ Azure OpenAI Endpoint / Azure AI Foundry (model endpoint) ]
  ↓
[ AI Model Response (stream) -> Backend -> Frontend -> Browser/User ]
```

### Key Design Choices
- **Azure Functions** for backend:
  - Scales automatically
  - Cost-effective for low-to-medium usage
  - Keeps API key secure server-side

- **Azure Static Web Apps** for hosting:
  - Handles both frontend + backend in one deployment
  - Built-in GitHub Actions CI/CD
  - Free SSL & domain mapping

- **DNS separation**:
  - `chat.jawon.kim` → Azure Static Web App
  - `www.jawon.kim` remains untouched

---

## 4. Folder Structure

```
chatbot-app/
├── frontend/                  # React frontend (Vite)
│   ├── public/                # Static assets (favicon, index.html)
│   ├── src/
│   │   ├── components/        # ChatWindow, MessageBubble, etc.
│   │   ├── App.jsx            # Main app component
│   │   ├── index.jsx          # React entry
│   │   └── styles.css         # or Tailwind entrypoint
│   ├── package.json
│   └── vite.config.js
│
├── api/                       # Azure Functions backend
│   ├── chat/                  # Function for chat proxy
│   │   ├── index.js
│   │   └── function.json
│   ├── package.json
│   └── .env.example
│
├── staticwebapp.config.json   # SWA routing & API rewrites
├── .gitignore
└── README.md
```

---

## 5. Demo Deployment Strategy

1. **Local Development**
   - Run frontend (`npm run dev`) and backend locally using Azure Functions Core Tools.
   - Test end-to-end chat flow.

2. **GitHub Integration**
   - Push repo to GitHub.
   - Link repo to Azure Static Web App with GitHub Actions for auto-deploy.

3. **DNS Setup (Porkbun)**
   - Create CNAME for `chat.jawon.kim` → Azure SWA endpoint.
   - Keep `www.jawon.kim` pointed to existing host.

4. **Go Live**
   - Deploy via GitHub Actions.
   - Monitor usage, costs, and latency.

---

## 6. Future Extensibility

- **Authentication**: Add OAuth 2.0 login (Google/Microsoft).
- **Model Extensibility**: The ability to support other AI models such as Gemini.
- **Persistent Memory**: CosmosDB + Azure Cognitive Search for RAG.
- **Multi-Tenant Support**: Separate contexts for each authenticated user.
- **Analytics**: Track usage patterns, most used features.
- **Styling & UX**: Animated message bubbles, themes, mobile optimization.

---

## 7. Technologies Used (Including those for hosting the demo website)

- **Frontend**: React, Vite, TailwindCSS
- **Backend**: Azure Functions (Node.js), Express-like HTTP handling
- **AI Model**: Azure OpenAI
- **Hosting**: Azure Static Web Apps
- **Domain**: Porkbun (custom DNS for subdomain mapping)

---

## 8. License
MIT License — feel free to fork, modify, and contribute.

---

## 9. Author
Built by Jawon Kim as a learning, portfolio MVP chatbot project.