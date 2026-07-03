import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface ContextChunk {
  chunkId: string;
  videoId: string;
  persona: string;
  text: string;
  language: string | null;
  startTime: number | null;
  endTime: number | null;
  /** Lexical relevance score against the query (0 when no query is given). */
  score: number;
}

export interface LoadContextOptions {
  /** Base data directory. Defaults to `<cwd>/src/data`. */
  dataRoot?: string;
  /** Source directory of chunk JSON files. Defaults to `<dataRoot>/chunks/<persona>/`. */
  chunksDir?: string;
  /** Query used to rank chunks by relevance (typically the current user message). */
  query?: string;
  /** Maximum number of chunks to return. Defaults to 6. */
  limit?: number;
}

interface RawChunk {
  chunkId?: unknown;
  videoId?: unknown;
  persona?: unknown;
  text?: unknown;
  language?: unknown;
  startTime?: unknown;
  endTime?: unknown;
}

const DEFAULT_LIMIT = 6;

function readCwd(): string {
  const runtime = globalThis as { process?: { cwd?: () => string } };
  return runtime.process?.cwd?.() ?? ".";
}

async function listSubdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function toContextChunk(raw: RawChunk): ContextChunk | undefined {
  if (typeof raw.chunkId !== "string" || typeof raw.text !== "string") {
    return undefined;
  }
  const text = raw.text.trim();
  if (!text) {
    return undefined;
  }
  return {
    chunkId: raw.chunkId,
    videoId: typeof raw.videoId === "string" ? raw.videoId : "",
    persona: typeof raw.persona === "string" ? raw.persona : "",
    text,
    language: typeof raw.language === "string" ? raw.language : null,
    startTime: typeof raw.startTime === "number" ? raw.startTime : null,
    endTime: typeof raw.endTime === "number" ? raw.endTime : null,
    score: 0,
  };
}

/** Lowercase alphanumeric tokens (keeps Latin technical terms; ignores markup). */
function tokenize(value: string): string[] {
  const matches = value.toLowerCase().match(/[a-z0-9]+/g);
  return matches ?? [];
}

/**
 * Number of distinct query terms that appear in the chunk text. Deliberately
 * simple lexical scoring — this module is a placeholder retriever, kept
 * replaceable so real semantic/vector retrieval can drop in later without
 * changing the prompt builder.
 */
function scoreChunk(chunkText: string, queryTerms: Set<string>): number {
  if (queryTerms.size === 0) {
    return 0;
  }
  const chunkTerms = new Set(tokenize(chunkText));
  let score = 0;
  for (const term of queryTerms) {
    if (chunkTerms.has(term)) {
      score += 1;
    }
  }
  return score;
}

/**
 * Load transcript chunks for a persona from local JSON files and return the most
 * relevant ones for `query`, deterministically. Chunks are read from
 * `<chunksDir>/<videoId>/*.json`. When no query is provided (or nothing matches),
 * chunks are returned in stable `chunkId` order.
 *
 * No vector search and no Qdrant — purely local file loading plus lexical
 * ranking. Duplicate chunk texts are removed.
 */
export async function loadContext(
  persona: string,
  options: LoadContextOptions = {},
): Promise<ContextChunk[]> {
  const id = persona?.trim();
  if (!id) {
    throw new Error("loadContext requires a persona id.");
  }

  const dataRoot = options.dataRoot ?? path.join(readCwd(), "src", "data");
  const chunksDir = options.chunksDir ?? path.join(dataRoot, "chunks", id);
  const limit = options.limit ?? DEFAULT_LIMIT;

  const chunks: ContextChunk[] = [];
  const seenText = new Set<string>();

  for (const videoId of await listSubdirectories(chunksDir)) {
    const videoDir = path.join(chunksDir, videoId);
    for (const fileName of await listJsonFiles(videoDir)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readFile(path.join(videoDir, fileName), "utf8"));
      } catch {
        continue;
      }
      const chunk = toContextChunk(parsed as RawChunk);
      if (!chunk) {
        continue;
      }
      // Prevent duplicated context from repeated transcript text.
      const key = chunk.text.replace(/\s+/g, " ").trim();
      if (seenText.has(key)) {
        continue;
      }
      seenText.add(key);
      chunks.push(chunk);
    }
  }

  const queryTerms = new Set(tokenize(options.query ?? ""));
  for (const chunk of chunks) {
    chunk.score = scoreChunk(chunk.text, queryTerms);
  }

  // Deterministic ordering: higher score first, then stable by chunkId.
  chunks.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.chunkId.localeCompare(b.chunkId);
  });

  return chunks.slice(0, Math.max(0, limit));
}
