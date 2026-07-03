# Architecture

## Goal

Build a maintainable AI persona chat application where users can talk to simulated tech educator personas. The system should be modular enough to support more personas, multiple retrieval sources, persistent memory, observability, and future background ingestion jobs without moving business logic into React components.

## High-Level Flow

1. UI submits a message to a route or server action.
2. Request validation runs at the server boundary.
3. Application use case loads persona metadata, conversation memory, and relevant public-source context.
4. AI orchestration layer applies persona instructions, safety constraints, retrieval context, and memory.
5. Infrastructure adapters call OpenAI, Qdrant, Redis, and PostgreSQL.
6. Response is returned with clear simulation framing and optional source metadata.

## Folder Structure

```text
src/
  app/
    (chat)/
    api/
      chat/
      health/
      personas/
  components/
    chat/
    layout/
    persona/
    ui/
  domain/
    content-sources/
    conversations/
    personas/
    users/
  application/
    chat/
      ports/
      use-cases/
    ingestion/
      ports/
      use-cases/
    memory/
      use-cases/
    personas/
      use-cases/
  infrastructure/
    ai/
      guardrails/
      langgraph/
      openai/
      prompts/
    cache/
      redis/
    database/
      postgres/
    ingestion/
      collectors/
        blog/
        github/
        linkedin/
        website/
        x/
        youtube/
      cleaning/
      storage/
    telemetry/
    vector/
      qdrant/
  server/
    actions/
    api/
    jobs/
    middleware/
  config/
  data/
    fixtures/
    ingestion/
      _schemas/
      normalized/
      raw/
    personas/
      _template/
        persona.json
    seed/
  lib/
  styles/
  types/
  utils/
tests/
  e2e/
  integration/
  unit/
migrations/
  postgres/
scripts/
```

## Folder Responsibilities

`src/app` contains Next.js App Router routes, layouts, route groups, and API route entry points. Files here should stay thin and delegate work to `src/application` or `src/server`.

`src/app/(chat)` is reserved for the authenticated or primary chat experience. It should contain route files and layout composition only, not chat orchestration logic.

`src/app/api` contains public HTTP route handlers. Each route should validate input, call an application use case, and translate results into HTTP responses.

`src/components` contains React components. Components should render data and emit UI events only. Business rules, retrieval, persistence, and model calls belong outside this folder.

`src/components/ui` is the shadcn/ui home. Generated shadcn components should live here so design primitives stay separate from product-specific components.

`src/components/chat`, `src/components/persona`, and `src/components/layout` are product-facing component groups. They should compose UI primitives and receive data through props.

`src/domain` contains pure business concepts such as Persona, Conversation, Message, SourceDocument, and User. This layer should not import Next.js, OpenAI, Redis, Qdrant, or PostgreSQL clients.

`src/application` contains use cases and service orchestration. This is where chat flows, persona selection, retrieval decisions, memory behavior, and ingestion workflows are coordinated through interfaces.

`src/application/*/ports` contains interfaces for dependencies such as vector search, memory storage, LLM generation, and metadata repositories. Infrastructure adapters implement these ports.

`src/infrastructure` contains concrete integrations with external systems. OpenAI, LangGraph, Qdrant, Redis, PostgreSQL, and telemetry clients belong here.

`src/infrastructure/ai/guardrails` contains reusable AI safety checks, persona disclaimers, source-use constraints, and output validation helpers.

`src/infrastructure/ai/prompts` contains the system prompt builder. Prompts are assembled dynamically from `persona.json` configuration — no hardcoded prompt text in code.

`src/server` contains server-only helpers that are tied to Next.js runtime concerns but are not route files themselves.

`src/server/jobs` is reserved for background jobs such as public-content ingestion, embedding refreshes, cleanup tasks, and scheduled metadata maintenance.

`src/config` centralizes environment parsing and runtime configuration. Secrets should be read through typed config helpers, never directly throughout the codebase.

`src/data` contains non-secret local seed data, fixtures, and persona metadata drafts. It should not contain private content, scraped data without permission, or API keys.

`src/data/personas` stores one `persona.json` per persona folder. Personas are discovered by scanning this directory. Adding a persona is a data-only change.

`src/data/ingestion` is the local staging area for collected public content (`raw/`, `normalized/`) and the shared `SourceDocument` schema.

`src/lib` contains cross-cutting helpers including persona loading and validation (`src/lib/personas`).

`src/styles` contains global styles and Tailwind entry points.

`src/types` contains shared TypeScript types that are not owned by a specific domain or application module.

`src/utils` contains generic utilities. Keep this folder small; domain-specific helpers should stay near their domain.

`tests/unit` contains fast tests for pure domain logic, use cases, prompt builders, validators, and adapters with mocked clients.

`tests/integration` contains tests that verify boundaries between app, application, and infrastructure layers.

`tests/e2e` contains browser-level tests for critical user flows once features exist.

`migrations/postgres` contains database migrations for conversation metadata, persona metadata, source metadata, and audit records.

`scripts` contains operational scripts for ingestion, embedding refresh, database maintenance, and local setup.

## Architectural Rules

- React components must not call OpenAI, Qdrant, Redis, or PostgreSQL directly.
- API route handlers must be thin and delegate business work to application use cases.
- Domain models must stay framework-independent.
- External services must be accessed through infrastructure adapters.
- All secrets must come from environment variables.
- Persona behavior must be based only on public content and must include simulation framing.
- Prompt logic and safety rules must be versioned, testable, and reviewable.

## Data Ownership

- PostgreSQL owns structured metadata: users, personas, conversations, messages, source documents, ingestion runs, and audit metadata.
- Redis owns short-lived memory and conversation state that can be rebuilt or expired.
- Qdrant owns vector embeddings and retrieval payloads derived from approved public sources.
- OpenAI owns transient model calls only; application state should not depend on OpenAI retaining conversation data.

