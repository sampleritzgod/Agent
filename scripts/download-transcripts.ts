/**
 * Operational script: download transcripts for collected YouTube videos and
 * store them under src/data/transcripts/<persona>/. Download + store only —
 * no LLM, no embeddings, no analysis.
 *
 * Usage:
 *   tsx scripts/download-transcripts.ts <input> --persona <id> [--lang en] [--concurrency 5] [--data-root path]
 *
 * <input> is a JSON file that is either:
 *   - an array of video id strings, or
 *   - a ChannelVideoCollection (the output of scripts/collect-youtube.ts).
 *
 * Example:
 *   tsx scripts/download-transcripts.ts src/data/ingestion/raw/youtube-UCxxxx.json --persona piyush
 */

import { readFile } from "node:fs/promises";

import { downloadTranscripts } from "@/features/transcript-downloader";

interface CliArgs {
  input: string;
  persona: string;
  lang?: string;
  concurrency?: number;
  dataRoot?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const positionals: string[] = [];
  let persona: string | undefined;
  let lang: string | undefined;
  let concurrency: number | undefined;
  let dataRoot: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--persona") {
      persona = argv[(i += 1)];
    } else if (arg === "--lang") {
      lang = argv[(i += 1)];
    } else if (arg === "--concurrency") {
      concurrency = Number.parseInt(argv[(i += 1)] ?? "", 10);
    } else if (arg === "--data-root") {
      dataRoot = argv[(i += 1)];
    } else {
      positionals.push(arg);
    }
  }

  const input = positionals[0];
  if (!input || !persona) {
    throw new Error(
      "Usage: tsx scripts/download-transcripts.ts <input> --persona <id> [--lang en] [--concurrency 5] [--data-root path]",
    );
  }

  return {
    input,
    persona,
    ...(lang ? { lang } : {}),
    ...(Number.isFinite(concurrency) ? { concurrency } : {}),
    ...(dataRoot ? { dataRoot } : {}),
  };
}

function extractVideoIds(parsed: unknown): string[] {
  if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
    return parsed;
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as { videos?: unknown }).videos)
  ) {
    return (parsed as { videos: Array<{ videoId?: string }> }).videos
      .map((video) => video.videoId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  }

  throw new Error(
    "Input must be a JSON array of video ids or a ChannelVideoCollection object.",
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const parsed: unknown = JSON.parse(await readFile(args.input, "utf8"));
  const videoIds = extractVideoIds(parsed);

  console.log(`Downloading transcripts for ${videoIds.length} video(s)...`);
  const summary = await downloadTranscripts({
    persona: args.persona,
    videoIds,
    ...(args.lang ? { lang: args.lang } : {}),
    ...(args.concurrency !== undefined ? { concurrency: args.concurrency } : {}),
    ...(args.dataRoot ? { dataRoot: args.dataRoot } : {}),
  });

  console.log(
    `Done. processed=${summary.processed} skipped=${summary.skipped} failed=${summary.failed}`,
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
