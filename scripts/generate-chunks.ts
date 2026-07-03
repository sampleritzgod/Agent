/**
 * Operational script: convert cleaned transcripts for a persona into semantic,
 * LLM-friendly chunks and write them under src/data/chunks/<persona>/<videoId>/.
 * Chunking only — no OpenAI, embeddings, or persona generation, and the cleaned
 * transcripts are only read.
 *
 * Usage:
 *   tsx scripts/generate-chunks.ts --persona <id> [--source dir] [--data-root path]
 *     [--min 500] [--max 800] [--overwrite]
 *
 * Reads cleaned transcripts from src/data/cleaned-transcripts/<persona>/ by default.
 *
 * Example:
 *   tsx scripts/generate-chunks.ts --persona hitesh
 */

import { generatePersonaChunks } from "@/features/chunk-generator";

interface CliArgs {
  persona: string;
  source?: string;
  dataRoot?: string;
  minTokens?: number;
  maxTokens?: number;
  overwrite: boolean;
  debug: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let persona: string | undefined;
  let source: string | undefined;
  let dataRoot: string | undefined;
  let minTokens: number | undefined;
  let maxTokens: number | undefined;
  let overwrite = false;
  let debug = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--persona") {
      persona = argv[(i += 1)];
    } else if (arg === "--source") {
      source = argv[(i += 1)];
    } else if (arg === "--data-root") {
      dataRoot = argv[(i += 1)];
    } else if (arg === "--min") {
      minTokens = Number.parseInt(argv[(i += 1)] ?? "", 10);
    } else if (arg === "--max") {
      maxTokens = Number.parseInt(argv[(i += 1)] ?? "", 10);
    } else if (arg === "--overwrite") {
      overwrite = true;
    } else if (arg === "--debug") {
      debug = true;
    }
  }

  if (!persona) {
    throw new Error(
      "Usage: tsx scripts/generate-chunks.ts --persona <id> [--source dir] [--data-root path] [--min 500] [--max 800] [--overwrite] [--debug]",
    );
  }

  return {
    persona,
    ...(source ? { source } : {}),
    ...(dataRoot ? { dataRoot } : {}),
    ...(Number.isFinite(minTokens) ? { minTokens } : {}),
    ...(Number.isFinite(maxTokens) ? { maxTokens } : {}),
    overwrite,
    debug,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const summary = await generatePersonaChunks({
    persona: args.persona,
    skipExisting: !args.overwrite,
    ...(args.source ? { sourceDir: args.source } : {}),
    ...(args.dataRoot ? { dataRoot: args.dataRoot } : {}),
    ...(args.minTokens !== undefined ? { targetMinTokens: args.minTokens } : {}),
    ...(args.maxTokens !== undefined ? { targetMaxTokens: args.maxTokens } : {}),
    ...(args.debug ? { debug: args.debug } : {}),
  });

  console.log(`Reading from: ${summary.sourceDir}`);
  console.log(
    `Done. processed=${summary.processed} skipped=${summary.skipped} failed=${summary.failed} (of ${summary.total}); ${summary.totalChunks} chunk(s).`,
  );
  console.log(`Saved to: ${summary.outputDir}`);

  const alreadyChunked = summary.results.filter(
    (result) => result.status === "processed" && (result.reason ?? "").startsWith("already chunked"),
  ).length;
  if (alreadyChunked > 0) {
    console.log(
      `Note: ${alreadyChunked} video(s) already had chunks and were left unchanged. Re-run with --overwrite to regenerate.`,
    );
  }

  const problems = summary.results.filter((result) => result.status !== "processed");
  for (const problem of problems) {
    console.log(`  [${problem.status}] ${problem.videoId}: ${problem.reason ?? ""}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
