# AI Persona Chat

Production-ready architecture scaffold for an AI-powered persona chat website.

This project is designed for simulated tech educator personas based only on public content. It must always present responses as AI-generated simulations and must never claim to be, represent, or speak on behalf of the real person.

## Getting started

`tsconfig.json` is only for TypeScript — it does **not** load API keys. Secrets live in a **`.env`** file at the project root (gitignored). Copy the template and fill in your keys:

```bash
cp .env.example .env
```

Then install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The chat API is `POST /api/chat` and needs `OPENAI_API_KEY` in `.env`.

### Environment variables (minimum to run features)

| Variable | Needed for |
|----------|------------|
| `OPENAI_API_KEY` | Chat API (`/api/chat`), persona analyzer, embedding generator |
| `YOUTUBE_API_KEY` | YouTube video collector script |

Optional: `OPENAI_CHAT_MODEL`, `OPENAI_RESPONSES_MODEL`, `OPENAI_EMBEDDING_MODEL`, conversation memory limits — see `.env.example`.

### Scripts (read `.env` automatically)

```bash
npm run collect:youtube -- https://www.youtube.com/@chaiaurcode
npm run download:transcripts -- src/data/ingestion/raw/youtube-UCxxxx.json --persona piyush
npm run clean:transcripts -- --persona piyush
npm run transliterate:transcripts -- --persona piyush
npm run generate:chunks -- --persona piyush
npm run generate:embeddings -- --persona piyush
npm run analyze:persona -- ./transcripts --creator "@chaiaurcode" --out persona.json
```

## Project Layout

Code is organized **feature-first** under `src/features/`. Each feature owns its
types, logic, and integrations in one place — no separate `domain/`,
`application/`, or `infrastructure/` layers.

```text
src/
  features/
    personas/          persona.json loading, validation, config types
    chat/              chat orchestration, memory, retrieval, prompt, OpenAI, HTTP
    persona-analyzer/  transcript -> persona profile (OpenAI)
    youtube-collector/ channel video metadata collection (YouTube Data API)
    transcript-downloader/ download + store video transcripts (no AI)
    transcript-cleaner/    clean raw transcripts into high-quality text (no AI)
    hindi-transliterator/  Devanagari -> Latin-script Hinglish (no AI, no translation)
    chunk-generator/       clean transcripts -> ~500-800 token chunks (no AI)
    embedding-generator/   chunks -> OpenAI embeddings stored locally
    prompt-builder/        persona .md + chunks + history -> final LLM prompt
  app/api/chat/        thin Next.js route delegating to the chat feature
  personas/            persona definitions as markdown (<persona>.system.md)
  data/                persona packs + local ingestion staging
scripts/               operational CLI entry points
```

Personas live in `src/data/personas/<id>/persona.json` and are loaded by
`src/features/personas`. Chat system prompts are built at runtime by
`src/features/chat/prompt-builder.ts`.

## Chat

`POST /api/chat` streams a persona-styled reply (Server-Sent Events). The route
in `src/app/api/chat/route.ts` delegates to `src/features/chat` (orchestrator,
conversation memory, transcript retrieval, prompt builder, OpenAI Responses
streaming client). Requires `OPENAI_API_KEY`.

## YouTube Collector

Collects all public videos from a YouTube channel (metadata only — title,
description, published date, duration, thumbnail, and video URL). Independent of
the AI system: no transcripts, no embeddings, no OpenAI.

Feature module: `src/features/youtube-collector/`
(`collectChannelVideos(channelUrl, options)`).

Set `YOUTUBE_API_KEY` (see `.env.example`), then run:

```bash
YOUTUBE_API_KEY=... tsx scripts/collect-youtube.ts https://www.youtube.com/@chaiaurcode
```

## Transcript Downloader

Downloads transcripts for collected YouTube videos and stores each as
`src/data/transcripts/<persona>/<videoId>.json`, preserving per-segment
timestamps. Batch-processed, resumable (skips already-downloaded files), and
resilient: videos without transcripts are skipped and unexpected errors are
recorded per-video without aborting the run. No LLM, embeddings, or analysis.

Feature module: `src/features/transcript-downloader/`
(`downloadTranscripts({ persona, videoIds, maxVideos, ... })` returns a summary
of processed / skipped / failed videos). The default provider retrieves captions
via YouTube's InnerTube player API using the maintained
[`youtube-transcript-plus`](https://www.npmjs.com/package/youtube-transcript-plus)
library (the legacy watch-page timed-text scraping now returns empty responses to
server-side requests). A custom `provider` can still be injected.

Videos are sampled **newest first** and capped by `maxVideos` (default **20**),
which is enough for persona generation — pass a larger number to process more.

```bash
npm run download:transcripts -- src/data/ingestion/raw/youtube-UCxxxx.json --persona piyush --maxVideos 20
```

`<input>` is a JSON file that is either an array of video id strings or a
`ChannelVideoCollection` (the output of `scripts/collect-youtube.ts`). Collections
are ordered by publish date (newest first) before the cap is applied.

Add `--debug` (or set `TRANSCRIPT_DEBUG=1`) to log the caption tracks found, the
chosen language, the request endpoints, and the HTTP responses for each video:

```bash
npm run download:transcripts -- src/data/ingestion/raw/youtube-UCxxxx.json --persona piyush --debug
```

## Transcript Cleaner

Transforms raw transcripts into clean, high-quality text for persona analysis and
RAG, **preserving per-segment timestamps**. Removes non-speech cues (`[Music]`,
`[Applause]`, `[Laughter]`), empty and consecutive-duplicate segments, URLs,
social handles, and like/share/subscribe & promotional boilerplate; normalizes
whitespace, HTML entities, Unicode, and punctuation. It never translates — Hindi
is preserved exactly and English technical terms are kept as-is — and greetings,
humor, audience interaction, teaching style, storytelling, and signature phrases
are retained. No OpenAI, embeddings, or persona generation.

Feature module: `src/features/transcript-cleaner/` — `cleanTranscript(raw)`
(pure, one transcript) and `cleanPersonaTranscripts({ persona, ... })` (batch).
Cleaned files are written to `src/data/cleaned-transcripts/<persona>/<videoId>.json`.

```bash
npm run clean:transcripts -- --persona hitesh
```

Reads raw transcripts from `src/data/transcripts/<persona>/` by default (override
with `--source <dir>`); pass `--overwrite` to re-clean existing files.

## Hindi Transliterator

Converts Devanagari Hindi transcripts into **Latin-script Hinglish**,
**transliterating only — never translating** (`हां जी कैसे हो?` → `Haan ji kaise
ho?`). The rule-based engine handles conjuncts, matras, anusvara/visarga, and
Hindi **schwa deletion** (`करके` → `karke`, `नमस्ते` → `namaste`) with no
tokenizer, OpenAI, or embeddings. English text passes through untouched, and a
technical-term dictionary keeps product/library names canonical — **Spring Boot,
React, Node.js, Redis, Docker, Kafka** (extendable via `technicalTerms`).

Output mirrors the cleaned transcript, **preserving timestamps** and, per
segment and for the full text, both `originalText` and `transliteratedText`.

Feature module: `src/features/hindi-transliterator/` — `transliterateHindi(text)`
(string), `transliterateTranscript(clean)` (one transcript), and
`transliteratePersonaTranscripts({ persona, ... })` (batch). Results are written to
`src/data/transliterated-transcripts/<persona>/<videoId>.json`.

```bash
npm run transliterate:transcripts -- --persona hitesh
```

Reads cleaned transcripts from `src/data/cleaned-transcripts/<persona>/` by
default (override with `--source <dir>`); pass `--overwrite` to regenerate.

## Chunk Generator

Converts cleaned transcripts into LLM-friendly chunks of **~500–800 tokens**,
**never splitting in the middle of a sentence** and **preserving timestamps and
context**. Each chunk carries `videoId`, `persona`, `language`, and the
`startTime`/`endTime` of the segments it spans. Token counts use a
dependency-free heuristic (~4 characters per token) — no tokenizer, OpenAI,
embeddings, or persona generation is involved.

Feature module: `src/features/chunk-generator/` — `chunkTranscript(clean, { persona })`
(pure, one transcript) and `generatePersonaChunks({ persona, ... })` (batch).
Each chunk is written to `src/data/chunks/<persona>/<videoId>/<chunkId>.json`:

```json
{
  "chunkId": "FZjJVuHWOIw-0000",
  "videoId": "FZjJVuHWOIw",
  "persona": "hitesh",
  "language": "hi",
  "startTime": 0.4,
  "endTime": 175.84,
  "text": "...",
  "segmentCount": 83,
  "estimatedTokens": 793
}
```

```bash
npm run generate:chunks -- --persona hitesh
```

Reads cleaned transcripts from `src/data/cleaned-transcripts/<persona>/` by
default (override with `--source <dir>`); tune bounds with `--min 500 --max 800`
and pass `--overwrite` to regenerate existing chunks. A single sentence longer
than the max budget becomes its own over-sized chunk rather than being split.
By default existing chunk directories are left untouched — the run reports them
as already chunked and reminds you to pass `--overwrite`.

Add `--debug` (or set `CHUNK_DEBUG=1`) to log per-file diagnostics: the
transcript file loaded, segment/sentence counts, estimated token totals, each
chunk boundary (id, start/end time, segments, tokens), and the reason a
transcript produces no chunks.

## Embedding Generator

Generates OpenAI embeddings (`text-embedding-3-small`, 1536 dims) for every
transcript chunk and stores them locally — **no retrieval, vector DB, or chat**.
Reads chunks from `src/data/chunks/<persona>/<videoId>/` and the API key from
`.env` (`OPENAI_API_KEY`), writing one file per chunk to
`src/data/embeddings/<persona>/<videoId>/<chunkId>.json`:

```json
{
  "chunkId": "FZjJVuHWOIw-0000",
  "videoId": "FZjJVuHWOIw",
  "persona": "hitesh",
  "text": "...",
  "embeddingModel": "text-embedding-3-small",
  "dimensions": 1536,
  "vector": [0.0123, -0.0456, "..."],
  "metadata": {
    "language": "hi",
    "startTime": 0.4,
    "endTime": 175.84,
    "estimatedTokens": 793
  }
}
```

Feature module: `src/features/embedding-generator/` — `embedText(text)` (single
vector) and `generatePersonaEmbeddings({ persona, ... })` (batch). Existing
embeddings are skipped unless `--overwrite` is passed, and a single chunk failing
(bad file or API error) is recorded without aborting the run. The summary reports
`processed`, `skipped`, `failed`, and `generated`.

```bash
npm run generate:embeddings -- --persona hitesh
```

Options: `--overwrite` (re-embed existing), `--debug` (or `EMBED_DEBUG=1`) to log
chunks loaded, each embedding request started / generated / saved, skipped
existing files, and failures; `--source <dir>`, `--data-root <path>`, and
`--model <name>` override the defaults.

## Prompt Builder

Constructs the final prompt sent to the LLM. Persona definitions are **plain
markdown, fully independent of code** — switching personas only changes which
`.md` file is loaded. Two personas ship today:

```text
src/personas/hitesh.system.md
src/personas/piyush.system.md
```

Feature module: `src/features/prompt-builder/`:

- `load-persona.ts` — `loadPersona(persona)` reads `<persona>.system.md` and
  returns the system prompt.
- `load-context.ts` — `loadContext(persona, { query })` loads transcript chunks
  from `src/data/chunks/<persona>/` and ranks them by simple lexical overlap.
  **No vector search, no Qdrant** — this module is intentionally replaceable so
  real semantic retrieval can drop in later without touching the builder.
- `build-prompt.ts` — `buildPrompt({ persona, userMessage, conversationHistory })`
  returns `{ systemPrompt, context, messages }`.

The final prompt is: a `system` message (persona definition + a "Relevant Creator
Context" block of the most relevant transcript chunks), followed by the recent
conversation history (oldest first), then the current `user` message. The builder
limits history to recent turns, de-duplicates repeated context, preserves message
order, and is deterministic. A route only needs to call `buildPrompt` and forward
`messages` to the model — it never builds prompts, calls OpenAI, or hardcodes
persona text.

```ts
import { buildPrompt } from "@/features/prompt-builder";

const { messages } = await buildPrompt({
  persona: "hitesh", // or "piyush"
  userMessage: "How does Redis caching work?",
  conversationHistory: recentTurns, // [{ role, content }]
});
```

## Persona Analyzer

Given cleaned transcript chunks from a single creator, generates a strongly typed
persona profile (communication style only) via the OpenAI API and writes a single
`persona.json`. It does not chat, answer questions, or do retrieval.

Feature module: `src/features/persona-analyzer/`
(`analyzePersona(chunks, options)` returns a typed `Persona`).

Set `OPENAI_API_KEY` (optionally `OPENAI_CHAT_MODEL`), then run:

```bash
OPENAI_API_KEY=... tsx scripts/analyze-persona.ts ./transcripts --creator "@chaiaurcode" --out persona.json
```

`<input>` is either a `.json` file (array of transcript strings) or a directory of `.txt`/`.md` transcript files.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Dependencies](docs/DEPENDENCIES.md)
- [Persona Safety](docs/PERSONA_SAFETY.md)

## Intended Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Node.js API routes
- OpenAI API
- Qdrant for vector search
- Redis for conversation memory
- PostgreSQL for metadata
- LangGraph or a clean agent orchestration layer

