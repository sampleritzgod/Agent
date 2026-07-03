/**
 * Minimal shape of a cleaned transcript this chunker reads. Declared here so the
 * chunk generator is independent of the transcript-cleaner feature; any object
 * with these fields (e.g. a CleanTranscript JSON) can be chunked.
 */
export interface CleanTranscriptSegmentInput {
  text: string;
  /** Start time in seconds. */
  offset: number;
  /** Segment duration in seconds. */
  duration: number;
}

export interface CleanTranscriptInput {
  videoId: string;
  language?: string | null;
  segments: CleanTranscriptSegmentInput[];
  /** Optional full text; recomputed from segments when absent. */
  text?: string;
}

/**
 * A single LLM-friendly chunk. Timestamps and context are preserved: `startTime`
 * / `endTime` come from the source segments the chunk spans, never split in the
 * middle of a sentence.
 */
export interface TranscriptChunk {
  chunkId: string;
  videoId: string;
  persona: string;
  language: string | null;
  /** Start time in seconds of the first segment in the chunk. */
  startTime: number;
  /** End time in seconds of the last segment in the chunk. */
  endTime: number;
  text: string;
  /** Number of source transcript segments this chunk spans. */
  segmentCount: number;
  /** Heuristic token estimate (~4 characters per token). */
  estimatedTokens: number;
}

export interface ChunkTranscriptOptions {
  /** Persona id, stored on every chunk. */
  persona: string;
  /** Lower bound of the target chunk size in tokens. Defaults to 500. */
  targetMinTokens?: number;
  /** Upper bound of the target chunk size in tokens. Defaults to 800. */
  targetMaxTokens?: number;
  /**
   * When true, log diagnostics (segment/sentence counts, total tokens, each
   * chunk boundary, and why a transcript yields no chunks). Falls back to the
   * `CHUNK_DEBUG` env var when omitted.
   */
  debug?: boolean;
}

export type ChunkStatus = "processed" | "skipped" | "failed";

export interface ChunkItemResult {
  videoId: string;
  status: ChunkStatus;
  /** Present for skipped/failed items, and for cached processed items. */
  reason?: string;
  /** Present for processed items: the per-video chunk directory. */
  outputDir?: string;
  /** Number of chunks written for this video. */
  chunkCount?: number;
}

export interface ChunkGenerationSummary {
  persona: string;
  sourceDir: string;
  outputDir: string;
  total: number;
  processed: number;
  skipped: number;
  failed: number;
  /** Total chunks written across all processed videos. */
  totalChunks: number;
  results: ChunkItemResult[];
}

export interface GeneratePersonaChunksOptions {
  /** Persona id; chunks are written under `<dataRoot>/chunks/<persona>/<videoId>/`. */
  persona: string;
  /** Base data directory. Defaults to `<cwd>/src/data`. */
  dataRoot?: string;
  /** Source directory of cleaned transcript JSON files. Defaults to `<dataRoot>/cleaned-transcripts/<persona>/`. */
  sourceDir?: string;
  /** Skip videos whose chunk directory already contains chunks. Defaults to true. */
  skipExisting?: boolean;
  /** Lower bound of the target chunk size in tokens. Defaults to 500. */
  targetMinTokens?: number;
  /** Upper bound of the target chunk size in tokens. Defaults to 800. */
  targetMaxTokens?: number;
  /** Log per-file diagnostics. See {@link ChunkTranscriptOptions.debug}. */
  debug?: boolean;
}
