/**
 * Operational script: clean downloaded transcripts for a persona and write the
 * results to src/data/cleaned-transcripts/<persona>/. Cleaning only — no OpenAI,
 * embeddings, or persona generation, and the downloader is untouched.
 *
 * Usage:
 *   tsx scripts/clean-transcripts.ts --persona <id> [--source dir] [--data-root path] [--overwrite]
 *
 * Reads raw transcripts from src/data/transcripts/<persona>/ by default.
 *
 * Example:
 *   tsx scripts/clean-transcripts.ts --persona hitesh
 */

import { cleanPersonaTranscripts } from "@/features/transcript-cleaner";

interface CliArgs {
  persona: string;
  source?: string;
  dataRoot?: string;
  overwrite: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let persona: string | undefined;
  let source: string | undefined;
  let dataRoot: string | undefined;
  let overwrite = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--persona") {
      persona = argv[(i += 1)];
    } else if (arg === "--source") {
      source = argv[(i += 1)];
    } else if (arg === "--data-root") {
      dataRoot = argv[(i += 1)];
    } else if (arg === "--overwrite") {
      overwrite = true;
    }
  }

  if (!persona) {
    throw new Error(
      "Usage: tsx scripts/clean-transcripts.ts --persona <id> [--source dir] [--data-root path] [--overwrite]",
    );
  }

  return {
    persona,
    ...(source ? { source } : {}),
    ...(dataRoot ? { dataRoot } : {}),
    overwrite,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const summary = await cleanPersonaTranscripts({
    persona: args.persona,
    skipExisting: !args.overwrite,
    ...(args.source ? { sourceDir: args.source } : {}),
    ...(args.dataRoot ? { dataRoot: args.dataRoot } : {}),
  });

  console.log(`Reading from: ${summary.sourceDir}`);
  console.log(
    `Done. processed=${summary.processed} skipped=${summary.skipped} failed=${summary.failed} (of ${summary.total})`,
  );
  console.log(`Saved to: ${summary.outputDir}`);

  const problems = summary.results.filter((result) => result.status !== "processed");
  for (const problem of problems) {
    console.log(`  [${problem.status}] ${problem.videoId}: ${problem.reason ?? ""}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
