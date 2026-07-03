# AI Persona Chat

Production-ready architecture scaffold for an AI-powered persona chat website.

This project is designed for simulated tech educator personas based only on public content. It must always present responses as AI-generated simulations and must never claim to be, represent, or speak on behalf of the real person.

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
  app/api/chat/        thin Next.js route delegating to the chat feature
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
(`downloadTranscripts({ persona, videoIds, ... })` returns a summary of
processed / skipped / failed videos). The default provider scrapes public
caption tracks; a custom `provider` can be injected.

```bash
tsx scripts/download-transcripts.ts src/data/ingestion/raw/youtube-UCxxxx.json --persona piyush
```

`<input>` is a JSON file that is either an array of video id strings or a
`ChannelVideoCollection` (the output of `scripts/collect-youtube.ts`).

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

