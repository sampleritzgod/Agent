/**
 * Minimal shape of a chunk file this generator reads (the output of the
 * chunk-generator). Declared here so the embedding generator is independent of
 * that feature; any object with `chunkId`, `videoId`, and `text` can be embedded.
 */
export interface TranscriptChunkInput {
  chunkId: string;
  videoId: string;
  persona?: string;
  language?: string | null;
  startTime?: number;
  endTime?: number;
  text: string;
  segmentCount?: number;
  estimatedTokens?: number;
}

export interface EmbeddingMetadata {
  language: string | null;
  startTime: number | null;
  endTime: number | null;
  estimatedTokens: number | null;
}

/** A stored embedding for a single transcript chunk. */
export interface ChunkEmbedding {
  chunkId: string;
  videoId: string;
  persona: string;
  text: string;
  embeddingModel: string;
  dimensions: number;
  vector: number[];
  metadata: EmbeddingMetadata;
}

export interface EmbedTextOptions {
  /** Defaults to `OPENAI_API_KEY`. */
  apiKey?: string;
  /** Defaults to `OPENAI_EMBEDDING_MODEL`, then `text-embedding-3-small`. */
  model?: string;
  /** Defaults to `OPENAI_API_BASE_URL`, then the public OpenAI API. */
  baseUrl?: string;
  /** Optionally request reduced embedding dimensions. Omit for the model default. */
  dimensions?: number;
  organization?: string;
  project?: string;
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface EmbedTextResult {
  vector: number[];
  /** Model reported by the API request. */
  model: string;
  /** Length of the returned vector. */
  dimensions: number;
}

export type EmbeddingStatus = "generated" | "skipped" | "failed";

export interface EmbeddingItemResult {
  chunkId: string;
  videoId: string;
  status: EmbeddingStatus;
  /** Present for skipped/failed items. */
  reason?: string;
  /** Present for generated items. */
  filePath?: string;
}

export interface EmbeddingSummary {
  persona: string;
  sourceDir: string;
  outputDir: string;
  model: string;
  total: number;
  /** Successfully handled = generated + skipped. */
  processed: number;
  skipped: number;
  failed: number;
  /** Embeddings freshly created via the API and saved this run. */
  generated: number;
  results: EmbeddingItemResult[];
}

export interface GeneratePersonaEmbeddingsOptions {
  /** Persona id; embeddings are written under `<dataRoot>/embeddings/<persona>/<videoId>/`. */
  persona: string;
  /** Base data directory. Defaults to `<cwd>/src/data`. */
  dataRoot?: string;
  /** Source directory of chunk JSON files. Defaults to `<dataRoot>/chunks/<persona>/`. */
  sourceDir?: string;
  /** Embedding model. Defaults to `OPENAI_EMBEDDING_MODEL`, then `text-embedding-3-small`. */
  model?: string;
  /** Defaults to `OPENAI_API_KEY`. */
  apiKey?: string;
  /** Defaults to `OPENAI_API_BASE_URL`, then the public OpenAI API. */
  baseUrl?: string;
  /** Optionally request reduced embedding dimensions. */
  dimensions?: number;
  /** Skip chunks whose embedding JSON already exists. Defaults to true. */
  skipExisting?: boolean;
  /** Log per-chunk diagnostics. Falls back to the `EMBED_DEBUG` env var when omitted. */
  debug?: boolean;
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}
