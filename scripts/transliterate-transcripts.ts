/**
 * Operational script: transliterate cleaned Devanagari transcripts for a persona
 * into Latin-script Hinglish and write the results to
 * src/data/transliterated-transcripts/<persona>/. Transliteration only — no
 * translation, persona generation, or embeddings, and the cleaner is untouched.
 *
 * Usage:
 *   tsx scripts/transliterate-transcripts.ts --persona <id> [--source dir] [--data-root path] [--overwrite]
 *
 * Reads cleaned transcripts from src/data/cleaned-transcripts/<persona>/ by default.
 *
 * Example:
 *   tsx scripts/transliterate-transcripts.ts --persona hitesh
 */

import { transliteratePersonaTranscripts } from "@/features/hindi-transliterator";

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
      "Usage: tsx scripts/transliterate-transcripts.ts --persona <id> [--source dir] [--data-root path] [--overwrite]",
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

  const summary = await transliteratePersonaTranscripts({
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
