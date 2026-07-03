# AI Persona Chat

An AI-powered educational chat application that simulates the public teaching styles of **Hitesh Choudhary** and **Piyush Garg**. Responses are generated from persona definitions, retrieved transcript context, and conversation history — always framed as AI simulations, never as the real creators.

---

## Project Overview

This project ingests public YouTube content from programming educators, processes transcripts into searchable chunks, and serves a chat interface where users can ask technical questions and receive answers in a selected educator's communication style.

The system is built as a **feature-first** TypeScript application:

1. **Data pipeline** — collect videos, download transcripts, clean text, and generate semantic chunks (stored locally under `src/data/`).
2. **Prompt builder** — assemble persona system prompts, relevant transcript excerpts, and conversation history into a final LLM prompt.
3. **Chat service** — validate requests, call the prompt builder, invoke the OpenAI Chat Completions API, and return structured responses.
4. **Web UI** — persona selector, markdown-rendered chat thread, loading/error states, and session-scoped conversation history.

All personas are simulated. The application must never claim to represent, speak for, or be endorsed by the real individuals. See [Persona Safety](docs/PERSONA_SAFETY.md).

---

## Features

| Area | Capability |
|------|------------|
| **Personas** | Hitesh Choudhary (warm Hinglish mentor) and Piyush Garg (clear, practical English) |
| **Persona switching** | Instant switch in the UI; each persona loads its own `.md` definition and transcript chunks |
| **Transcript grounding** | Lexical retrieval of the most relevant local chunks per user message |
| **Conversation memory** | Recent turns passed on each request and included in the prompt (session-scoped in the browser) |
| **Markdown responses** | Code blocks with syntax highlighting, lists, and inline code in assistant messages |
| **Data pipeline** | YouTube collection → transcript download → cleaning → chunking (CLI scripts) |
| **Embeddings** | Optional local embedding generation for future semantic retrieval |
| **Hindi transliteration** | Optional Devanagari → Latin Hinglish for cleaned Hindi transcripts |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [Next.js 15](https://nextjs.org/) (App Router) |
| Language | TypeScript (strict) |
| UI | React 19, CSS modules via global stylesheet |
| Markdown | `react-markdown`, `remark-gfm`, `rehype-highlight` |
| LLM | OpenAI Chat Completions API |
| Embeddings | OpenAI `text-embedding-3-small` (offline generation only) |
| YouTube | YouTube Data API v3 + `youtube-transcript-plus` |
| Runtime | Node.js (API routes use `runtime = "nodejs"`) |
| Tooling | `tsx` for CLI scripts, `tsc` for type checking |

---

## Architecture

The application follows a **thin route, thick feature** pattern. The Next.js API route delegates entirely to the chat feature; business logic never lives in route handlers.

```text
User (Browser)
    │
    ▼
src/app/chat-app.tsx          Persona selector, message UI, history state
    │
    ▼ POST /api/chat
src/app/api/chat/route.ts     Thin HTTP adapter
    │
    ▼
src/features/chat/            ChatService, request parsing, error handling
    │
    ├──► src/features/prompt-builder/
    │         loadPersona()      → src/personas/<id>.system.md
    │         loadContext()      → src/data/chunks/<id>/
    │         buildPrompt()      → system + history + user messages
    │
    ▼
OpenAI Chat Completions API
    │
    ▼
JSON response → UI (Markdown rendered)
```

**Data ingestion** (offline, CLI-driven) runs independently of the chat runtime:

```text
YouTube channel URL
    → youtube-collector        (metadata JSON)
    → transcript-downloader    (raw transcripts)
    → transcript-cleaner       (cleaned transcripts)
    → chunk-generator          (LLM-friendly chunks)
    → embedding-generator      (optional vectors)
```

Detailed design notes: [Architecture](docs/ARCHITECTURE.md) · [Data Collection](docs/data-collection.md) · [Prompt Engineering](docs/prompt-engineering.md) · [Context Management](docs/context-management.md)

---

## Folder Structure

```text
Agent/
├── src/
│   ├── app/
│   │   ├── api/chat/route.ts     Chat API endpoint
│   │   ├── chat-app.tsx          Chat UI component
│   │   ├── globals.css           Styles
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── features/
│   │   ├── chat/                 Chat service + HTTP adapter
│   │   ├── prompt-builder/       Persona + context + prompt assembly
│   │   ├── youtube-collector/    Channel video metadata
│   │   ├── transcript-downloader/
│   │   ├── transcript-cleaner/
│   │   ├── chunk-generator/
│   │   ├── embedding-generator/
│   │   ├── hindi-transliterator/
│   │   ├── persona-analyzer/
│   │   └── personas/             Persona JSON config loading
│   ├── personas/
│   │   ├── hitesh.system.md      Hitesh persona definition (chat)
│   │   └── piyush.system.md      Piyush persona definition (chat)
│   └── data/
│       ├── ingestion/raw/        YouTube collection JSON
│       ├── transcripts/<persona>/
│       ├── cleaned-transcripts/<persona>/
│       ├── chunks/<persona>/
│       └── embeddings/<persona>/   (optional, not used in retrieval yet)
├── scripts/                      CLI entry points for the data pipeline
├── docs/                         Project documentation
├── .env.example                  Environment variable template
└── package.json
```

---

## Installation

**Prerequisites:** Node.js 18+ and npm.

```bash
# Clone the repository and enter the project directory
cd Agent

# Install dependencies
npm install

# Create environment file from template
cp .env.example .env
```

Edit `.env` and set at minimum:

- `OPENAI_API_KEY` — required for chat
- `YOUTUBE_API_KEY` — required only for the YouTube collector script

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes (chat) | OpenAI API key |
| `OPENAI_CHAT_MODEL` | No | Chat model (default: `gpt-5.5` or fallback `gpt-4o` in code) |
| `OPENAI_CHAT_TEMPERATURE` | No | Sampling temperature (default `0.7`) |
| `OPENAI_CHAT_MAX_TOKENS` | No | Max completion tokens (default `1024`) |
| `OPENAI_CHAT_MAX_HISTORY` | No | Max history turns in prompt (default `10`) |
| `OPENAI_CHAT_MAX_CONTEXT_CHUNKS` | No | Max transcript chunks per request (default `6`) |
| `OPENAI_API_BASE_URL` | No | OpenAI API base URL |
| `OPENAI_EMBEDDING_MODEL` | No | Embedding model for `generate:embeddings` |
| `YOUTUBE_API_KEY` | Yes (collector) | YouTube Data API v3 key |
| `YOUTUBE_API_BASE_URL` | No | YouTube API base URL |
| `APP_ENV` | No | `development` or `production` |

See `.env.example` for the full list including optional future infrastructure (Redis, Qdrant, PostgreSQL).

> **Note:** `tsconfig.json` configures TypeScript only. Secrets are loaded from `.env` at runtime by Next.js and `tsx --env-file=.env` for scripts.

---

## Running the Project

### Development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production build

```bash
npm run build
npm start
```

### Type checking

```bash
npm run typecheck
```

### Data pipeline (offline)

Run these in order when building or refreshing a persona dataset. See [Data Collection](docs/data-collection.md) for details.

```bash
# 1. Collect channel videos (example channels)
npm run collect:youtube -- https://www.youtube.com/@chaiaurcode
npm run collect:youtube -- https://www.youtube.com/@piyushgargdev

# 2. Download transcripts (newest 20 videos by default)
npm run download:transcripts -- src/data/ingestion/raw/youtube-<channelId>.json --persona hitesh
npm run download:transcripts -- src/data/ingestion/raw/youtube-<channelId>.json --persona piyush

# 3. Clean transcripts
npm run clean:transcripts -- --persona hitesh
npm run clean:transcripts -- --persona piyush

# 4. Generate chunks
npm run generate:chunks -- --persona hitesh
npm run generate:chunks -- --persona piyush

# Optional: embeddings, transliteration, persona analysis
npm run generate:embeddings -- --persona hitesh
npm run transliterate:transcripts -- --persona hitesh
npm run analyze:persona -- ./transcripts --creator "@chaiaurcode" --out persona.json
```

---

## Persona Switching

The chat UI exposes two personas:

| Persona | Style | Primary topics |
|---------|-------|----------------|
| **Hitesh Choudhary** | Warm Hinglish, mentor-to-friend, analogy-driven | Full-stack, DevOps, JavaScript, career guidance |
| **Piyush Garg** | Clear English, mental-model-first, project-driven | React, Node.js, APIs, system design |

**How switching works:**

1. The user selects a persona card in the header.
2. The UI clears the current conversation (no cross-persona history leak).
3. Each `POST /api/chat` request sends `{ persona, message, conversationHistory }`.
4. The server loads `src/personas/<persona>.system.md` and chunks from `src/data/chunks/<persona>/`.
5. The model responds in the selected style.

Persona definitions live in markdown files and are independent of application code. Adding a persona is primarily a matter of adding a new `<id>.system.md` file and a corresponding dataset.

---

## Chat API

**Endpoint:** `POST /api/chat`

**Request:**

```json
{
  "persona": "hitesh",
  "message": "How does Redis caching work?",
  "conversationHistory": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Haan ji!" }
  ]
}
```

**Response:**

```json
{
  "message": "...",
  "usage": {
    "promptTokens": 100,
    "completionTokens": 50,
    "totalTokens": 150
  },
  "model": "gpt-5.5"
}
```

---

## Screenshots

> Placeholder — add screenshots before final submission.

| Screenshot | Description |
|--------------|-------------|
| `docs/screenshots/home-desktop.png` | Desktop chat with persona selector |
| `docs/screenshots/hitesh-conversation.png` | Hitesh answering a backend question |
| `docs/screenshots/piyush-conversation.png` | Piyush answering a frontend question |
| `docs/screenshots/mobile-view.png` | Responsive mobile layout |
| `docs/screenshots/error-retry.png` | Error state with retry button |

To capture: run `npm run dev`, interact with the app, and save images under `docs/screenshots/`.

---

## Future Improvements

- **Semantic retrieval** — use locally generated embeddings with vector search instead of lexical chunk ranking
- **Streaming responses** — server-sent events for token-by-token display
- **Persistent sessions** — Redis or PostgreSQL-backed conversation memory
- **Expanded datasets** — more videos per persona, periodic re-ingestion
- **Automated tests** — unit tests for prompt builder and integration tests for the chat API
- **Rate limiting and auth** — production hardening for public deployment
- **Observability** — structured logging and OpenTelemetry tracing

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [Data Collection](docs/data-collection.md) | YouTube ingestion through chunk generation |
| [Prompt Engineering](docs/prompt-engineering.md) | Persona prompts, context usage, consistency |
| [Context Management](docs/context-management.md) | Chunk selection, history, prompt assembly |
| [Sample Conversations](docs/sample-conversations.md) | Example dialogues for both personas |
| [Architecture](docs/ARCHITECTURE.md) | Design principles and feature responsibilities |
| [Persona Safety](docs/PERSONA_SAFETY.md) | Simulation framing and content policy |
| [Dependencies](docs/DEPENDENCIES.md) | External services and packages |

---

## License

Private academic / submission project. Public educator content is used only as style reference from publicly available YouTube transcripts.
