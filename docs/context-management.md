# Context Management

This document describes how transcript chunks are selected, how conversation history is managed, and how the final LLM prompt is assembled. Implementation: `src/features/prompt-builder/`.

---

## Overview

Context management has two inputs:

| Input | Source | Purpose |
|-------|--------|---------|
| **Transcript chunks** | `src/data/chunks/<persona>/` | Ground responses in the creator's public teaching material |
| **Conversation history** | Client session state → API request body | Maintain multi-turn continuity |

Both are combined with the persona system prompt inside `buildPrompt()`.

```text
                    buildPrompt()
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   loadPersona()   loadContext()   selectHistory()
         │               │               │
         ▼               ▼               ▼
   hitesh.system.md   top-N chunks   recent turns
         │               │               │
         └───────────────┴───────────────┘
                         │
                         ▼
              messages[] for OpenAI
```

---

## Transcript Chunk Selection

**Module:** `src/features/prompt-builder/load-context.ts`  
**Function:** `loadContext(persona, { query, limit })`

### Storage layout

```text
src/data/chunks/
  hitesh/
    <videoId>/
      <videoId>-0000.json
      <videoId>-0001.json
  piyush/
    <videoId>/
      ...
```

Each chunk JSON contains `chunkId`, `videoId`, `persona`, `text`, `language`, `startTime`, `endTime`, and `estimatedTokens`.

### Loading process

1. List all video subdirectories under `src/data/chunks/<persona>/`
2. Read every `*.json` chunk file (sorted by filename for determinism)
3. Parse valid chunks; skip malformed files
4. **De-duplicate** by normalized chunk text (prevents repeated context)
5. **Score** each chunk against the user query
6. **Sort** by score descending, then by `chunkId` for stable ties
7. Return the top `limit` chunks (default 6)

### Scoring algorithm

Current implementation uses **lexical overlap** (intentionally simple and replaceable):

1. Tokenize the user query into lowercase alphanumeric terms
2. Remove **stopwords** (common English and Hinglish function words)
3. Count how many query terms appear in the chunk text
4. Higher overlap → higher score

**Example:**

| Query | Meaningful terms extracted |
|-------|---------------------------|
| "How does Redis caching work?" | `redis`, `caching` |
| "Explain React hooks with an example" | `explain`, `react`, `hooks`, `example` |

If stopword removal leaves no terms, the full token list is used as a fallback.

### When no query matches

Chunks with score `0` are still returned in stable `chunkId` order (up to the limit). This ensures some context is available even for vague queries.

### Persona isolation

`loadContext()` reads only from `src/data/chunks/<persona>/`. A Hitesh request never loads Piyush chunks and vice versa.

### Future replacement

The module is designed as a **drop-in retriever**. Semantic search over `src/data/embeddings/` can replace lexical scoring without changing `buildPrompt()`'s interface — pass pre-loaded `contextChunks` or swap the internals of `loadContext()`.

---

## Conversation History Management

**Module:** `src/features/prompt-builder/build-prompt.ts`  
**Function:** `selectHistory(history, userMessage, maxMessages)`

### Client-side (browser)

`src/app/chat-app.tsx` maintains:

```typescript
messages: { id, role: "user" | "assistant", content }[]
```

On each send:

- The new user message is appended locally (optimistic UI)
- Prior turns are sent as `conversationHistory` (excluding the new message)
- On persona switch, `messages` is cleared — **no cross-persona leak**

### Server-side processing

| Step | Behavior |
|------|----------|
| Validate | Only `user` and `assistant` roles with non-empty content |
| De-duplicate | Remove trailing `user` turn if identical to current `userMessage` |
| Cap | Keep last `maxHistoryMessages` turns (default 10, env-configurable) |
| Order | Oldest first in the final message array |

### Why the current message is separate

The API accepts `message` (current question) and `conversationHistory` (prior turns) as distinct fields. `buildPrompt()` places history in the middle of the array and the current message last. This prevents the model from seeing the same user text twice.

### Limits

| Setting | Default | Env variable |
|---------|---------|--------------|
| Max history turns | 10 | `OPENAI_CHAT_MAX_HISTORY` |
| Max context chunks | 6 | `OPENAI_CHAT_MAX_CONTEXT_CHUNKS` |
| Max chars per chunk in prompt | 1200 | Hardcoded in `buildPrompt` input default |

---

## Prompt Assembly

**Module:** `src/features/prompt-builder/build-prompt.ts`  
**Function:** `buildPrompt(input)` → `{ systemPrompt, context, messages, usedChunks }`

### Step-by-step

#### 1. Load persona

```typescript
const systemPrompt = await loadPersona(persona);
// Reads src/personas/<persona>.system.md
```

#### 2. Load context chunks

```typescript
const usedChunks = await loadContext(persona, {
  query: userMessage,
  limit: maxContextChunks,
});
```

Or use pre-supplied `contextChunks` for testing or future custom retrievers.

#### 3. Format creator context block

Chunks are wrapped in XML-like tags for clear boundaries:

```xml
<chunk index="1" videoId="FZjJVuHWOIw" startTime="0.4" endTime="175.84">
...truncated chunk text...
</chunk>
```

Long chunks are truncated to `maxCharsPerChunk` (default 1200) with a `[…]` suffix.

If no chunks are found, the context section is omitted entirely.

#### 4. Append response directives

A persona-agnostic `# Response Directives` block is always appended, covering:

- In-character consistency across the full conversation
- History respect and anti-generic-AI phrasing
- Honest handling when excerpts don't contain the answer
- No invented creator facts

#### 5. Assemble system message

```text
<persona.system.md content>

# Relevant Creator Context
<formatted chunks + usage rules>

# Response Directives
<directives>
```

#### 6. Build message array

```typescript
messages = [
  { role: "system", content: systemContent },
  ...history,                              // capped prior turns
  { role: "user", content: userMessage },  // current question
];
```

### Determinism

Given the same persona, user message, history, and on-disk chunks, `buildPrompt()` produces the same `messages` array. Chunk ordering is stable via score + `chunkId` tie-breaking.

---

## End-to-End Flow

```text
User selects "Hitesh" and types "How does Redis caching work?"
        │
        ▼
chat-app.tsx sends POST /api/chat
  { persona: "hitesh", message: "...", conversationHistory: [...] }
        │
        ▼
ChatService.chat()
  ├── assertSupportedPersona("hitesh")
  ├── assertPersonaExists("hitesh")
  └── buildPrompt({ persona, userMessage, conversationHistory })
        │
        ├── loadPersona("hitesh")     → hitesh.system.md
        ├── loadContext("hitesh", { query })  → 6 Redis-related chunks
        └── selectHistory(...)        → prior turns
        │
        ▼
OpenAI Chat Completions API (messages array)
        │
        ▼
Assistant reply → UI (Markdown rendered)
```

---

## Observability

In development (`APP_ENV=development` or `NODE_ENV=development`), `ChatService` logs:

- Persona, message length, history turn count
- Number of messages and context chunks after `buildPrompt`
- OpenAI request start and token usage

This helps verify that context is loading without inspecting the full prompt in production.

---

## Related Documentation

- [Prompt Engineering](prompt-engineering.md) — persona strategy and consistency
- [Data Collection](data-collection.md) — how chunks are produced
- [Sample Conversations](sample-conversations.md) — example outputs
