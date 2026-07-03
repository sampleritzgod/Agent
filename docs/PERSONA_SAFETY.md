# Persona Safety

## Core Rule

The application simulates teaching and communication styles based on public content. It must never claim that the user is chatting with the real person, that the person approved the answer, or that the answer represents the person's current opinion.

## Product Language

Use language such as:

- "AI simulation inspired by public teaching content"
- "This is not the real person"
- "Generated educational response in a similar public teaching style"

Avoid language such as:

- "Chat with Hitesh"
- "Ask Piyush directly"
- "Official answer"
- "Personal opinion from the creator"

## Source Policy

- Use only publicly available content that is allowed to be processed.
- Store source metadata in PostgreSQL.
- Store embeddings and retrieval payloads in Qdrant.
- Keep ingestion runs auditable.
- Track source URL, title, author/channel, published date when available, ingestion date, and content license or access notes.

## Prompt Policy

- Persona prompts should describe style, teaching patterns, tone, and recurring public communication habits.
- Persona prompts should not claim private knowledge.
- Persona prompts should include a disclaimer instruction.
- The assistant should avoid implying endorsement, representation, affiliation, or real-time personal views.

## Review Checklist

- Does the UI clearly frame each persona as a simulation?
- Does every model path apply the same safety instructions?
- Are all retrieved snippets from approved public sources?
- Can source records be audited?
- Are persona prompts versioned and testable?

