# Architecture

## Goal

Build a maintainable AI persona chat application where users can talk to simulated tech educator personas. The codebase is organized **feature-first**: each feature keeps its types, logic, and external integrations together, so behavior is easy to find and change without navigating layered abstractions.

## Principles

- Organize by feature, not by architectural layer. No global `domain/`, `application/`, or `infrastructure/` trees.
- Keep related functionality in one folder. Prefer plain functions and small classes over ports/adapters/repositories/use-cases.
- Introduce an interface only when it is actually needed (a real second implementation or a genuine test seam), and co-locate it with its implementation inside the feature.
- Keep only production code that is used. React/route files stay thin and delegate to features.
- Read secrets from environment variables at the feature boundary; never scatter `process.env` access.
- Persona behavior is based only on public content and must always carry simulation framing.

## Folder Structure

```text
src/
  features/
    personas/
      persona-config.ts          Persona types (PersonaConfig, prompt context)
      persona-manager.ts         Load/validate persona packs; persona source for chat
      validate-persona-config.ts Structural validation
      persona-errors.ts          Typed persona errors
      index.ts
    chat/
      conversation.ts            Conversation message/session/history types
      chat-model.ts              Streaming model types + StreamingLanguageModel interface
      prompt-builder.ts          System prompt assembly from persona + context
      conversation-memory.ts     Memory store interface, summarizer, manager, in-memory store
      redis-memory-store.ts      Optional Redis-backed store
      transcript-retriever.ts    TranscriptRetriever interface + local keyword retriever
      openai-streaming-client.ts OpenAI Responses streaming client
      chat-orchestrator.ts       Coordinates one chat turn
      chat-service.ts            Wiring + env config for the orchestrator
      chat-stream.ts             SSE framing
      chat-http.ts               Request parsing, errors, POST handler
      index.ts
    persona-analyzer/            Transcript chunks -> typed Persona profile (OpenAI)
    youtube-collector/           Channel video metadata via YouTube Data API v3
  app/
    api/chat/route.ts            Thin Next.js route -> features/chat
  data/
    personas/                    One persona.json per persona folder
    ingestion/                   Local staging (raw/, normalized/) + shared schema
  types/                         Ambient typings (node builtins)
tests/
migrations/postgres/
scripts/                         Operational CLI entry points
```

## Feature Responsibilities

`features/personas` loads and validates persona packs from `src/data/personas/<id>/persona.json`. `PersonaManager` is the single entry point and also serves as the persona source (`getPersonaById`) for chat.

`features/chat` owns the full chat turn: load persona and conversation memory, retrieve transcript context, build the system prompt, stream the model response, and persist the assistant reply. Interfaces that have real value are kept here next to their implementations: `ConversationMemoryStore` (in-memory and Redis implementations), `StreamingLanguageModel` (OpenAI implementation + test seam), and `TranscriptRetriever` (local implementation, future vector search).

`features/persona-analyzer` turns cleaned transcript chunks into a strongly typed `Persona` profile using OpenAI Structured Outputs. It only analyzes communication style; it never chats or retrieves.

`features/youtube-collector` collects public channel video metadata via the YouTube Data API v3. It is independent of the AI system.

`app/api/chat/route.ts` is a thin Next.js route handler that delegates to `features/chat`.

`data/` holds persona packs and local ingestion staging. `scripts/` holds operational CLI entry points that import features directly.

## Runtime Notes

- The app targets ES2022 with the DOM lib, so `fetch`, `Response`, streams, `TextEncoder`, and `crypto` are used directly. Node builtins (`node:fs/promises`, `node:path`) are typed via `src/types/node-builtins.d.ts`.
- Conversation memory defaults to an in-memory store; Redis is an opt-in alternative for production.
- The chat model integration uses the OpenAI Responses streaming API over `fetch`, with the client injectable for tests.
