import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { chunkTranscript } from "./chunk-transcript";
import type {
  ChunkGenerationSummary,
  ChunkItemResult,
  ChunkTranscriptOptions,
  CleanTranscriptInput,
  GeneratePersonaChunksOptions,
} from "./types";

function readCwd(): string {
  const runtime = globalThis as { process?: { cwd?: () => string } };
  return runtime.process?.cwd?.() ?? ".";
}

function readEnv(name: string): string | undefined {
  const runtime = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.[name];
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => path.join(dir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

async function countJsonFiles(dir: string): Promise<number> {
  return (await listJsonFiles(dir)).length;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function isCleanTranscript(value: unknown): value is CleanTranscriptInput {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { videoId?: unknown }).videoId === "string" &&
    Array.isArray((value as { segments?: unknown }).segments)
  );
}

/**
 * Chunk every cleaned transcript for a persona and write each chunk to
 * `<dataRoot>/chunks/<persona>/<videoId>/<chunkId>.json`, preserving timestamps
 * and context. Standalone service — no OpenAI, embeddings, or persona
 * generation; cleaned transcripts are only read, never modified.
 *
 * Transcripts that produce no chunks are skipped; unreadable or invalid files
 * are recorded as failed without aborting the batch.
 */
export async function generatePersonaChunks(
  options: GeneratePersonaChunksOptions,
): Promise<ChunkGenerationSummary> {
  const persona = options.persona?.trim();
  if (!persona) {
    throw new Error("generatePersonaChunks requires a persona id.");
  }
  if (persona.includes("/") || persona.includes("\\")) {
    throw new Error(`Invalid persona id "${persona}".`);
  }

  const dataRoot = options.dataRoot ?? path.join(readCwd(), "src", "data");
  const sourceDir =
    options.sourceDir ?? path.join(dataRoot, "cleaned-transcripts", persona);
  const outputDir = path.join(dataRoot, "chunks", persona);
  const skipExisting = options.skipExisting ?? true;
  const debug =
    options.debug ?? (readEnv("CHUNK_DEBUG") === "1" || readEnv("CHUNK_DEBUG") === "true");

  const chunkOptions: ChunkTranscriptOptions = {
    persona,
    ...(options.targetMinTokens !== undefined
      ? { targetMinTokens: options.targetMinTokens }
      : {}),
    ...(options.targetMaxTokens !== undefined
      ? { targetMaxTokens: options.targetMaxTokens }
      : {}),
    ...(debug ? { debug } : {}),
  };

  const files = await listJsonFiles(sourceDir);
  await mkdir(outputDir, { recursive: true });
  if (debug) {
    console.log(`[chunk] source=${sourceDir} files=${files.length} skipExisting=${skipExisting}`);
  }

  const results: ChunkItemResult[] = [];

  for (const file of files) {
    const videoId = path.basename(file, ".json");
    const videoDir = path.join(outputDir, videoId);

    if (skipExisting) {
      const existing = await countJsonFiles(videoDir);
      if (existing > 0) {
        if (debug) {
          console.log(
            `[chunk:${videoId}] skip-existing: ${existing} chunk(s) already on disk (use overwrite to regenerate)`,
          );
        }
        // Count existing chunks so the summary reflects reality instead of 0.
        results.push({
          videoId,
          status: "processed",
          outputDir: videoDir,
          chunkCount: existing,
          reason: `already chunked (${existing} chunks); use --overwrite to regenerate`,
        });
        continue;
      }
    }

    try {
      if (debug) {
        console.log(`[chunk:${videoId}] loading ${file}`);
      }
      const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
      if (!isCleanTranscript(parsed)) {
        if (debug) {
          console.log(`[chunk:${videoId}] failed: not a valid cleaned transcript file`);
        }
        results.push({ videoId, status: "failed", reason: "not a valid cleaned transcript file" });
        continue;
      }

      const chunks = chunkTranscript(parsed, chunkOptions);
      if (chunks.length === 0) {
        results.push({ videoId, status: "skipped", reason: "no chunks produced" });
        continue;
      }

      // Replace any stale chunks so re-runs stay consistent.
      if (await pathExists(videoDir)) {
        await rm(videoDir, { recursive: true, force: true });
      }
      await mkdir(videoDir, { recursive: true });

      for (const chunk of chunks) {
        const chunkPath = path.join(videoDir, `${chunk.chunkId}.json`);
        await writeFile(chunkPath, `${JSON.stringify(chunk, null, 2)}\n`, "utf8");
      }

      results.push({
        videoId,
        status: "processed",
        outputDir: videoDir,
        chunkCount: chunks.length,
      });
    } catch (error) {
      results.push({
        videoId,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    persona,
    sourceDir,
    outputDir,
    total: files.length,
    processed: results.filter((result) => result.status === "processed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    totalChunks: results.reduce((sum, result) => sum + (result.chunkCount ?? 0), 0),
    results,
  };
}
