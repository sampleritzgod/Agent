# Dependencies

This is the planned dependency set. Versions should be pinned by the package lockfile during installation.

## Runtime

- `next`: React framework with App Router, API routes, server components, and production build tooling.
- `react`: UI runtime.
- `react-dom`: React DOM renderer required by Next.js.
- `typescript`: Type system for application, server, and infrastructure layers.

## UI

- `tailwindcss`: Utility-first styling system.
- `postcss`: CSS transform pipeline used by Tailwind.
- `autoprefixer`: Browser prefix support for generated CSS.
- `tailwindcss-animate`: Animation utilities commonly used by shadcn/ui.
- `class-variance-authority`: Variant management for reusable UI components.
- `clsx`: Conditional class composition.
- `tailwind-merge`: Safe merging of Tailwind class names.
- `lucide-react`: Icon library commonly paired with shadcn/ui.
- `@radix-ui/react-slot`: Composition primitive used by shadcn/ui buttons and polymorphic components.

## AI

- `openai`: Official OpenAI API client.
- `@langchain/langgraph`: Graph-based agent orchestration if the chat flow needs branching, memory checkpoints, or multi-step retrieval.
- `@langchain/core`: Shared LangChain interfaces.
- `@langchain/openai`: LangChain OpenAI integration.
- `langchain`: Optional higher-level LangChain utilities for document handling and retrieval workflows.

## Data

- `@qdrant/js-client-rest`: Qdrant client for vector search.
- `ioredis`: Redis client for conversation memory, rate limiting, and cache-backed state.
- `pg`: PostgreSQL driver.
- `drizzle-orm`: Type-safe SQL and schema modeling.
- `postgres`: Optional lightweight PostgreSQL client if using Drizzle with the postgres.js driver instead of `pg`.

## Validation And Security

- `zod`: Runtime validation for environment variables, API inputs, AI outputs, and domain DTOs.
- `server-only`: Prevents server-only modules from being imported into client bundles.
- `nanoid`: Safe ID generation for public identifiers where database IDs should not be exposed.

## Observability

- `pino`: Structured application logging.
- `@opentelemetry/api`: Tracing API for request, retrieval, and model-call instrumentation.

## Testing

- `vitest`: Unit and integration test runner.
- `@testing-library/react`: React component testing.
- `@testing-library/jest-dom`: DOM assertions.
- `playwright`: End-to-end browser testing.
- `msw`: API mocking for tests.

## Quality

- `eslint`: Static linting.
- `eslint-config-next`: Next.js lint rules.
- `prettier`: Formatting.
- `tsx`: Runs TypeScript scripts for local operations such as ingestion or maintenance.

## Suggested Install Commands

```bash
pnpm add next react react-dom openai @qdrant/js-client-rest ioredis pg drizzle-orm zod server-only nanoid pino @opentelemetry/api class-variance-authority clsx tailwind-merge lucide-react @radix-ui/react-slot @langchain/langgraph @langchain/core @langchain/openai langchain
pnpm add -D typescript tailwindcss postcss autoprefixer tailwindcss-animate eslint eslint-config-next prettier vitest @testing-library/react @testing-library/jest-dom playwright msw tsx
```

If LangGraph is not needed after the first implementation pass, keep the agent orchestration behind an application port so it can be removed without touching UI or route handlers.

