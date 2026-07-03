/**
 * Operational script: generate OpenAI embeddings for a persona's transcript
 * chunks and store them under src/data/embeddings/<persona>/<videoId>/. Generate
 * + store only — no retrieval, vector DB, or chat.
 *
 * Usage:
 *   tsx scripts/generate-embeddings.ts --persona <id> [--source dir] [--data-root path]
 *     [--model text-embedding-3-small] [--overwrite] [--debug]
 *
 * Reads chunks from src/data/chunks/<persona>/ by default and the API key from
 * .env (OPENAI_API_KEY).
 *
 * Example:
 *   npm run generate:embeddings -- --persona hitesh
 */

import { generatePersonaEmbeddings } from "@/features/embedding-generator";

interface CliArgs {
  persona: string;
  source?: string;
  dataRoot?: string;
  model?: string;
  overwrite: boolean;
  debug: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let persona: string | undefined;
  let source: string | undefined;
  let dataRoot: string | undefined;
  let model: string | undefined;
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
    } else if (arg === "--model") {
      model = argv[(i += 1)];
    } else if (arg === "--overwrite") {
      overwrite = true;
    } else if (arg === "--debug") {
      debug = true;
    }
  }

  if (!persona) {
    throw new Error(
      "Usage: tsx scripts/generate-embeddings.ts --persona <id> [--source dir] [--data-root path] [--model m] [--overwrite] [--debug]",
    );
  }

  return {
    persona,
    ...(source ? { source } : {}),
    ...(dataRoot ? { dataRoot } : {}),
    ...(model ? { model } : {}),
    overwrite,
    debug,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const summary = await generatePersonaEmbeddings({
    persona: args.persona,
    skipExisting: !args.overwrite,
    ...(args.source ? { sourceDir: args.source } : {}),
    ...(args.dataRoot ? { dataRoot: args.dataRoot } : {}),
    ...(args.model ? { model: args.model } : {}),
    ...(args.debug ? { debug: args.debug } : {}),
  });

  console.log(`Reading from: ${summary.sourceDir}`);
  console.log(`Model: ${summary.model}`);
  console.log(
    `Done. processed=${summary.processed} skipped=${summary.skipped} failed=${summary.failed} generated=${summary.generated} (of ${summary.total})`,
  );
  console.log(`Saved to: ${summary.outputDir}`);

  const failures = summary.results.filter((result) => result.status === "failed");
  for (const failure of failures) {
    console.log(`  [failed] ${failure.videoId}/${failure.chunkId}: ${failure.reason ?? ""}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
