import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { cleanTranscript } from "./clean-transcript";
import type {
  CleanPersonaTranscriptsOptions,
  CleanTranscriptItemResult,
  CleanTranscriptSummary,
  RawTranscriptInput,
} from "./types";

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

function isRawTranscript(value: unknown): value is RawTranscriptInput {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { videoId?: unknown }).videoId === "string" &&
    Array.isArray((value as { segments?: unknown }).segments)
  );
}

/**
 * Clean every downloaded transcript for a persona and write the results to
 * `<dataRoot>/cleaned-transcripts/<persona>/<videoId>.json`, preserving
 * timestamps. Transcripts that become empty after cleaning are skipped; unreadable
 * or invalid files are recorded as failed without aborting the batch.
 *
 * Independent service — no OpenAI, embeddings, persona generation, or changes to
 * the transcript downloader.
 */
export async function cleanPersonaTranscripts(
  options: CleanPersonaTranscriptsOptions,
): Promise<CleanTranscriptSummary> {
  const persona = options.persona?.trim();
  if (!persona) {
    throw new Error("cleanPersonaTranscripts requires a persona id.");
  }
  if (persona.includes("/") || persona.includes("\\")) {
    throw new Error(`Invalid persona id "${persona}".`);
  }

  const dataRoot = options.dataRoot ?? path.join(readCwd(), "src", "data");
  const sourceDir = options.sourceDir ?? path.join(dataRoot, "transcripts", persona);
  const outputDir = path.join(dataRoot, "cleaned-transcripts", persona);
  const skipExisting = options.skipExisting ?? true;

  const files = await listJsonFiles(sourceDir);
  await mkdir(outputDir, { recursive: true });

  const results: CleanTranscriptItemResult[] = [];

  for (const file of files) {
    const videoId = path.basename(file, ".json");
    const outputPath = path.join(outputDir, `${videoId}.json`);

    if (skipExisting && (await fileExists(outputPath))) {
      results.push({
        videoId,
        status: "processed",
        filePath: outputPath,
        reason: "already cleaned",
      });
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
      if (!isRawTranscript(parsed)) {
        results.push({ videoId, status: "failed", reason: "not a valid transcript file" });
        continue;
      }

      const cleaned = cleanTranscript(parsed);
      if (cleaned.cleanedSegmentCount === 0) {
        results.push({ videoId, status: "skipped", reason: "empty after cleaning" });
        continue;
      }

      await writeFile(outputPath, `${JSON.stringify(cleaned, null, 2)}\n`, "utf8");
      results.push({
        videoId,
        status: "processed",
        filePath: outputPath,
        cleanedSegmentCount: cleaned.cleanedSegmentCount,
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
    results,
  };
}
