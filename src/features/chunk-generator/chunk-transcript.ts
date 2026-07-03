import type {
  ChunkTranscriptOptions,
  CleanTranscriptInput,
  CleanTranscriptSegmentInput,
  TranscriptChunk,
} from "./types";

const DEFAULT_MIN_TOKENS = 500;
const DEFAULT_MAX_TOKENS = 800;
/** ~4 characters per token — a good, dependency-free approximation of BPE tokenizers. */
const CHARS_PER_TOKEN = 4;

/** Heuristic token estimate. No tokenizer/model is loaded. */
export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / CHARS_PER_TOKEN));
}

function readEnv(name: string): string | undefined {
  const runtime = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.[name];
}

function isDebugEnabled(options: ChunkTranscriptOptions): boolean {
  if (options.debug !== undefined) {
    return options.debug;
  }
  const flag = readEnv("CHUNK_DEBUG");
  return flag === "1" || flag === "true";
}

function debugLog(videoId: string, message: string): void {
  console.log(`[chunk:${videoId}] ${message}`);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

interface SegmentSpan {
  startChar: number;
  endChar: number;
  startTime: number;
  endTime: number;
}

interface Sentence {
  /** Inclusive-exclusive char range in the joined transcript text. */
  start: number;
  end: number;
  text: string;
  tokens: number;
}

/**
 * Join segments into a single text stream while recording each segment's char
 * range and time range, so sentences can be mapped back to timestamps.
 */
function buildSpans(segments: CleanTranscriptSegmentInput[]): {
  fullText: string;
  spans: SegmentSpan[];
} {
  const spans: SegmentSpan[] = [];
  let fullText = "";

  segments.forEach((segment, index) => {
    const text = segment.text.trim();
    if (!text) {
      return;
    }
    const startChar = fullText.length;
    fullText += text;
    spans.push({
      startChar,
      endChar: fullText.length,
      startTime: segment.offset,
      endTime: segment.offset + segment.duration,
    });
    if (index < segments.length - 1) {
      fullText += " ";
    }
  });

  return { fullText, spans };
}

function isTerminator(char: string): boolean {
  return char === "." || char === "!" || char === "?";
}

function isClosing(char: string): boolean {
  return char === '"' || char === "'" || char === ")" || char === "]" || char === "”" || char === "’";
}

/**
 * Split text into sentences, preserving each sentence's char range. A boundary
 * is a run of terminators (`.`/`!`/`?`) plus optional closing quotes/brackets,
 * followed by whitespace or end-of-text. Trailing text without punctuation is
 * emitted as a final sentence so nothing is lost.
 */
function splitIntoSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  const len = text.length;
  let start = 0;
  let i = 0;

  const push = (from: number, to: number): void => {
    const raw = text.slice(from, to);
    const trimmed = raw.trim();
    if (trimmed) {
      sentences.push({ start: from, end: to, text: trimmed, tokens: estimateTokens(trimmed) });
    }
  };

  while (i < len) {
    if (!isTerminator(text[i])) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < len && isTerminator(text[j])) {
      j += 1;
    }
    while (j < len && isClosing(text[j])) {
      j += 1;
    }
    if (j >= len || /\s/.test(text[j])) {
      push(start, j);
      i = j;
      while (i < len && /\s/.test(text[i])) {
        i += 1;
      }
      start = i;
    } else {
      i = j;
    }
  }

  if (start < len) {
    push(start, len);
  }

  return sentences;
}

/** First segment whose char range reaches `pos` (the segment containing `pos`). */
function segmentIndexAt(spans: SegmentSpan[], pos: number): number {
  for (let k = 0; k < spans.length; k += 1) {
    if (pos < spans[k].endChar) {
      return k;
    }
  }
  return spans.length - 1;
}

function countSpanningSegments(
  spans: SegmentSpan[],
  startChar: number,
  endChar: number,
): number {
  let count = 0;
  for (const span of spans) {
    if (span.startChar < endChar && span.endChar > startChar) {
      count += 1;
    }
  }
  return count;
}

/**
 * Convert a cleaned transcript into semantic chunks of ~500–800 tokens,
 * never splitting in the middle of a sentence. Each chunk preserves the
 * videoId, persona, language, and the start/end timestamps of the segments it
 * spans. Pure and deterministic — no OpenAI, embeddings, or persona generation.
 *
 * A single sentence longer than the max budget becomes its own (over-sized)
 * chunk rather than being split. The final chunk may fall below the min budget.
 */
export function chunkTranscript(
  transcript: CleanTranscriptInput,
  options: ChunkTranscriptOptions,
): TranscriptChunk[] {
  const persona = options.persona?.trim();
  if (!persona) {
    throw new Error("chunkTranscript requires a persona id.");
  }

  const minTokens = options.targetMinTokens ?? DEFAULT_MIN_TOKENS;
  const maxTokens = options.targetMaxTokens ?? DEFAULT_MAX_TOKENS;
  if (!Number.isFinite(minTokens) || !Number.isFinite(maxTokens) || minTokens <= 0) {
    throw new Error("Target token bounds must be positive numbers.");
  }
  if (maxTokens < minTokens) {
    throw new Error("`targetMaxTokens` must be >= `targetMinTokens`.");
  }

  const debug = isDebugEnabled(options);
  const sourceSegmentCount = (transcript.segments ?? []).length;

  const { fullText, spans } = buildSpans(transcript.segments ?? []);
  if (debug) {
    debugLog(
      transcript.videoId,
      `segments=${sourceSegmentCount} (non-empty=${spans.length}), ~${estimateTokens(
        fullText,
      )} total tokens, budget=${minTokens}-${maxTokens}`,
    );
  }
  if (spans.length === 0) {
    if (debug) {
      debugLog(transcript.videoId, "0 chunks: no non-empty segments after trimming");
    }
    return [];
  }

  const sentences = splitIntoSentences(fullText);
  if (sentences.length === 0) {
    if (debug) {
      debugLog(transcript.videoId, "0 chunks: no sentences detected in transcript text");
    }
    return [];
  }
  if (debug) {
    debugLog(transcript.videoId, `sentences=${sentences.length}`);
  }

  const language = transcript.language ?? null;
  const chunks: TranscriptChunk[] = [];

  let group: Sentence[] = [];
  let groupTokens = 0;

  const flush = (): void => {
    if (group.length === 0) {
      return;
    }
    const startChar = group[0].start;
    const endChar = group[group.length - 1].end;
    const startTime = spans[segmentIndexAt(spans, startChar)].startTime;
    const endTime = spans[segmentIndexAt(spans, endChar - 1)].endTime;
    const text = group.map((sentence) => sentence.text).join(" ");
    const index = chunks.length;

    const chunk: TranscriptChunk = {
      chunkId: `${transcript.videoId}-${String(index).padStart(4, "0")}`,
      videoId: transcript.videoId,
      persona,
      language,
      startTime: round(startTime),
      endTime: round(endTime),
      text,
      segmentCount: countSpanningSegments(spans, startChar, endChar),
      estimatedTokens: estimateTokens(text),
    };
    chunks.push(chunk);

    if (debug) {
      debugLog(
        transcript.videoId,
        `chunk ${chunk.chunkId}: [${chunk.startTime}s-${chunk.endTime}s] ` +
          `sentences=${group.length} segments=${chunk.segmentCount} tokens=${chunk.estimatedTokens}`,
      );
    }

    group = [];
    groupTokens = 0;
  };

  for (const sentence of sentences) {
    // Close the current chunk before it would exceed the max budget, but keep
    // whole sentences together (a lone over-sized sentence becomes its own chunk).
    if (group.length > 0 && groupTokens + sentence.tokens > maxTokens) {
      flush();
    }
    group.push(sentence);
    groupTokens += sentence.tokens;
  }
  // Emit the trailing group even if it is smaller than the target minimum, so no
  // content is dropped.
  flush();

  if (debug) {
    debugLog(transcript.videoId, `emitted ${chunks.length} chunk(s)`);
  }

  return chunks;
}
