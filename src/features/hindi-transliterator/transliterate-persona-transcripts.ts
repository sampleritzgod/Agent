import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { transliterateTranscript } from "./transliterate-transcript";
import type {
  CleanTranscriptInput,
  TransliterateItemResult,
  TransliteratePersonaTranscriptsOptions,
  TransliterateSummary,
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

function isCleanTranscript(value: unknown): value is CleanTranscriptInput {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { videoId?: unknown }).videoId === "string" &&
    Array.isArray((value as { segments?: unknown }).segments)
  );
}

/**
 * Transliterate every cleaned transcript for a persona and write the results to
 * `<dataRoot>/transliterated-transcripts/<persona>/<videoId>.json`, preserving
 * the original text and timestamps.
 *
 * Independent service — no translation, persona generation, or embeddings, and
 * the cleaner is untouched. Unreadable or invalid files are recorded as failed
 * without aborting the batch.
 */
export async function transliteratePersonaTranscripts(
  options: TransliteratePersonaTranscriptsOptions,
): Promise<TransliterateSummary> {
  const persona = options.persona?.trim();
  if (!persona) {
    throw new Error("transliteratePersonaTranscripts requires a persona id.");
  }
  if (persona.includes("/") || persona.includes("\\")) {
    throw new Error(`Invalid persona id "${persona}".`);
  }

  const dataRoot = options.dataRoot ?? path.join(readCwd(), "src", "data");
  const sourceDir =
    options.sourceDir ?? path.join(dataRoot, "cleaned-transcripts", persona);
  const outputDir = path.join(dataRoot, "transliterated-transcripts", persona);
  const skipExisting = options.skipExisting ?? true;

  const files = await listJsonFiles(sourceDir);
  await mkdir(outputDir, { recursive: true });

  const results: TransliterateItemResult[] = [];

  for (const file of files) {
    const videoId = path.basename(file, ".json");
    const outputPath = path.join(outputDir, `${videoId}.json`);

    if (skipExisting && (await fileExists(outputPath))) {
      results.push({
        videoId,
        status: "processed",
        filePath: outputPath,
        reason: "already transliterated",
      });
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
      if (!isCleanTranscript(parsed)) {
        results.push({ videoId, status: "failed", reason: "not a valid cleaned transcript file" });
        continue;
      }

      const transliterated = transliterateTranscript(parsed, options.transliterate ?? {});
      if (transliterated.segmentCount === 0) {
        results.push({ videoId, status: "skipped", reason: "empty transcript" });
        continue;
      }

      await writeFile(outputPath, `${JSON.stringify(transliterated, null, 2)}\n`, "utf8");
      results.push({
        videoId,
        status: "processed",
        filePath: outputPath,
        segmentCount: transliterated.segmentCount,
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
