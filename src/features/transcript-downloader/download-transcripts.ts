import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { fetchYouTubeTranscript } from "./fetch-youtube-transcript";
import type {
  DownloadTranscriptsOptions,
  FetchTranscriptOptions,
  TranscriptDownloadSummary,
  TranscriptItemResult,
  TranscriptProvider,
} from "./types";

const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 20;

function readCwd(): string {
  const runtime = globalThis as { process?: { cwd?: () => string } };
  return runtime.process?.cwd?.() ?? ".";
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

/**
 * Download transcripts for a list of YouTube video ids and store each as
 * `<dataRoot>/transcripts/<persona>/<videoId>.json`, preserving timestamps.
 *
 * Videos without a transcript are skipped (not failed), unexpected errors are
 * recorded per-video, and the batch always completes. No LLM, embeddings, or
 * analysis is involved.
 */
export async function downloadTranscripts(
  options: DownloadTranscriptsOptions,
): Promise<TranscriptDownloadSummary> {
  const persona = options.persona?.trim();
  if (!persona) {
    throw new Error("downloadTranscripts requires a persona id.");
  }
  if (persona.includes("/") || persona.includes("\\")) {
    throw new Error(`Invalid persona id "${persona}".`);
  }
  if (!Array.isArray(options.videoIds)) {
    throw new Error("downloadTranscripts requires an array of videoIds.");
  }

  const provider: TranscriptProvider = options.provider ?? fetchYouTubeTranscript;
  const dataRoot = options.dataRoot ?? path.join(readCwd(), "src", "data");
  const outputDir = path.join(dataRoot, "transcripts", persona);
  const skipExisting = options.skipExisting ?? true;
  const concurrency = Math.min(
    MAX_CONCURRENCY,
    Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY),
  );

  const videoIds = [...new Set(options.videoIds.map((id) => id.trim()).filter(Boolean))];

  await mkdir(outputDir, { recursive: true });

  const fetchOptions: FetchTranscriptOptions = {
    ...(options.lang ? { lang: options.lang } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };

  const processOne = async (videoId: string): Promise<TranscriptItemResult> => {
    const filePath = path.join(outputDir, `${videoId}.json`);

    if (skipExisting && (await fileExists(filePath))) {
      return { videoId, status: "processed", filePath, reason: "already downloaded" };
    }

    try {
      const transcript = await provider(videoId, fetchOptions);
      if (!transcript || transcript.segments.length === 0) {
        return { videoId, status: "skipped", reason: "no transcript available" };
      }

      await writeFile(filePath, `${JSON.stringify(transcript, null, 2)}\n`, "utf8");
      return {
        videoId,
        status: "processed",
        filePath,
        segmentCount: transcript.segments.length,
      };
    } catch (error) {
      return {
        videoId,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const results: TranscriptItemResult[] = [];
  for (const batch of chunk(videoIds, concurrency)) {
    results.push(...(await Promise.all(batch.map(processOne))));
  }

  return {
    persona,
    outputDir,
    total: videoIds.length,
    processed: results.filter((result) => result.status === "processed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  };
}
