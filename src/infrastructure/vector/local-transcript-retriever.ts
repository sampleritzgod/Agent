import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { TranscriptRetriever } from "@/application/chat/ports/transcript-retriever";
import type { RetrievedTranscriptChunk } from "@/domain/personas/persona-config";

export interface LocalTranscriptRetrieverOptions {
  dataRoot: string;
  defaultLimit?: number;
  maxFiles?: number;
}

interface TranscriptCandidate extends RetrievedTranscriptChunk {
  sourcePath: string;
}

const SUPPORTED_EXTENSIONS = [".txt", ".md", ".json"];
const DEFAULT_LIMIT = 6;
const DEFAULT_MAX_FILES = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compact(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function supportedFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function uniqueTokens(value: string): string[] {
  return [...new Set(tokenize(value))];
}

function scoreCandidate(queryTokens: string[], candidate: TranscriptCandidate): number {
  if (queryTokens.length === 0) {
    return 0;
  }

  const title = candidate.sourceTitle?.toLowerCase() ?? "";
  const text = candidate.text.toLowerCase();

  return queryTokens.reduce((score, token) => {
    const titleBoost = title.includes(token) ? 3 : 0;
    const textBoost = text.includes(token) ? 1 : 0;
    return score + titleBoost + textBoost;
  }, 0);
}

function normalizeChunkObject(
  value: Record<string, unknown>,
  fallbackTitle: string,
  sourcePath: string,
): TranscriptCandidate | undefined {
  const text =
    compact(value.text) ??
    compact(value.content) ??
    compact(value.transcript) ??
    compact(value.chunk);

  if (!text) {
    return undefined;
  }

  return {
    text,
    sourceTitle: compact(value.sourceTitle) ?? compact(value.title) ?? fallbackTitle,
    sourceUrl: compact(value.sourceUrl) ?? compact(value.url),
    publishedAt: compact(value.publishedAt),
    sourcePath,
  };
}

function normalizeJsonChunks(
  parsed: unknown,
  fallbackTitle: string,
  sourcePath: string,
): TranscriptCandidate[] {
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => {
        if (typeof item === "string") {
          return {
            text: item.trim(),
            sourceTitle: fallbackTitle,
            sourcePath,
          };
        }

        if (isRecord(item)) {
          return normalizeChunkObject(item, fallbackTitle, sourcePath);
        }

        return undefined;
      })
      .filter((item): item is TranscriptCandidate => Boolean(item?.text));
  }

  if (isRecord(parsed)) {
    const nested = parsed.chunks ?? parsed.transcripts ?? parsed.documents;
    if (Array.isArray(nested)) {
      return normalizeJsonChunks(nested, fallbackTitle, sourcePath);
    }

    const chunk = normalizeChunkObject(parsed, fallbackTitle, sourcePath);
    return chunk ? [chunk] : [];
  }

  return [];
}

export class LocalTranscriptRetriever implements TranscriptRetriever {
  private readonly defaultLimit: number;
  private readonly maxFiles: number;

  constructor(private readonly options: LocalTranscriptRetrieverOptions) {
    this.defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  }

  async retrieve(input: Parameters<TranscriptRetriever["retrieve"]>[0]): Promise<RetrievedTranscriptChunk[]> {
    const limit = Math.max(0, input.limit ?? this.defaultLimit);
    if (limit === 0) {
      return [];
    }

    const files = await this.findTranscriptFiles(input.personaId);
    const candidates = (
      await Promise.all(files.slice(0, this.maxFiles).map((file) => this.readFileChunks(file)))
    ).flat();

    if (candidates.length === 0) {
      return [];
    }

    const queryTokens = uniqueTokens(input.userMessage);
    const scored = candidates.map((candidate, index) => ({
      candidate,
      index,
      score: scoreCandidate(queryTokens, candidate),
    }));

    const hasPositiveScore = scored.some((item) => item.score > 0);
    return scored
      .filter((item) => !hasPositiveScore || item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, limit)
      .map(({ candidate }) => ({
        text: candidate.text,
        sourceTitle: candidate.sourceTitle,
        sourceUrl: candidate.sourceUrl,
        publishedAt: candidate.publishedAt,
      }));
  }

  private async findTranscriptFiles(personaId: string): Promise<string[]> {
    const roots = [
      path.join(this.options.dataRoot, "personas", personaId, "transcripts"),
      path.join(this.options.dataRoot, "personas", personaId, "transcripts.json"),
      path.join(this.options.dataRoot, "ingestion", "normalized", personaId),
      path.join(this.options.dataRoot, "ingestion", "normalized", `${personaId}.json`),
    ];

    const files: string[] = [];
    for (const root of roots) {
      files.push(...(await this.collectFiles(root)));
    }

    return [...new Set(files)].filter(supportedFile).sort();
  }

  private async collectFiles(targetPath: string): Promise<string[]> {
    try {
      const info = await stat(targetPath);
      if (info.isFile()) {
        return [targetPath];
      }

      if (!info.isDirectory()) {
        return [];
      }
    } catch {
      return [];
    }

    const entries = await readdir(targetPath, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) => {
        const entryPath = path.join(targetPath, entry.name);
        if (entry.isDirectory()) {
          return this.collectFiles(entryPath);
        }
        if (entry.isFile()) {
          return Promise.resolve([entryPath]);
        }
        return Promise.resolve([]);
      }),
    );

    return nested.flat();
  }

  private async readFileChunks(filePath: string): Promise<TranscriptCandidate[]> {
    const raw = await readFile(filePath, "utf8");
    const fallbackTitle = filePath.split("/").at(-1) ?? "Transcript chunk";

    if (filePath.toLowerCase().endsWith(".json")) {
      try {
        return normalizeJsonChunks(JSON.parse(raw), fallbackTitle, filePath);
      } catch {
        return [];
      }
    }

    const text = raw.trim();
    return text
      ? [
          {
            text,
            sourceTitle: fallbackTitle,
            sourcePath: filePath,
          },
        ]
      : [];
  }
}
