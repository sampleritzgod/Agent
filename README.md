# AI Persona Chat

Production-ready architecture scaffold for an AI-powered persona chat website.

This project is designed for simulated tech educator personas based only on public content. It must always present responses as AI-generated simulations and must never claim to be, represent, or speak on behalf of the real person.

## Current Scope

This repository currently contains architecture, folder structure, persona configuration utilities, and dependency planning.

Personas live in `src/data/personas/<id>/persona.json`. System prompts are built at runtime by `src/infrastructure/ai/prompts/build-system-prompt.ts`.

## YouTube Persona Collector

Collects all public videos from a YouTube channel (metadata only — title, description, published date, duration, thumbnail, and video URL). It is fully decoupled from the AI system: no transcripts, no embeddings, no OpenAI.

- Domain model: `src/domain/content-sources/channel-video.ts`
- Port (interface): `src/application/ingestion/ports/channel-video-source.ts`
- Use case: `src/application/ingestion/use-cases/collect-channel-videos.ts`
- Adapter (YouTube Data API v3): `src/infrastructure/ingestion/collectors/youtube/`

Set `YOUTUBE_API_KEY` (see `.env.example`), then run:

```bash
YOUTUBE_API_KEY=... tsx scripts/ingestion/collect-youtube.ts https://www.youtube.com/@chaiaurcode
```

## Persona Analyzer

Given cleaned transcript chunks from a single creator, generates a strongly typed persona profile (communication style only) via the OpenAI API and writes a single `persona.json`. It does not chat, answer questions, or do retrieval.

Feature module: `src/features/persona-analyzer/` (`analyzePersona(chunks, options)` returns a typed `Persona`).

Set `OPENAI_API_KEY` (optionally `OPENAI_CHAT_MODEL`), then run:

```bash
OPENAI_API_KEY=... tsx scripts/persona/analyze-persona.ts ./transcripts --creator "@chaiaurcode" --out persona.json
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

