/**
 * Operational script: collect all public videos from a YouTube channel and write
 * the raw collection to disk. Metadata only — no transcripts, no AI.
 *
 * Usage:
 *   YOUTUBE_API_KEY=... tsx scripts/collect-youtube.ts <channelUrl> [--limit N] [--out path]
 *
 * Example:
 *   YOUTUBE_API_KEY=... tsx scripts/collect-youtube.ts https://www.youtube.com/@chaiaurcode
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { collectChannelVideos } from "@/features/youtube-collector";

interface CliArgs {
  channelUrl: string;
  limit?: number;
  outPath?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const positionals: string[] = [];
  let limit: number | undefined;
  let outPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit") {
      limit = Number.parseInt(argv[(i += 1)] ?? "", 10);
    } else if (arg === "--out") {
      outPath = argv[(i += 1)];
    } else {
      positionals.push(arg);
    }
  }

  const channelUrl = positionals[0];
  if (!channelUrl) {
    throw new Error(
      "Missing channel URL.\nUsage: tsx scripts/collect-youtube.ts <channelUrl> [--limit N] [--out path]",
    );
  }

  return {
    channelUrl,
    ...(Number.isFinite(limit) ? { limit } : {}),
    ...(outPath ? { outPath } : {}),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log(`Collecting videos from: ${args.channelUrl}`);
  const collection = await collectChannelVideos(args.channelUrl, {
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  });

  console.log(
    `Channel: ${collection.channel.title} (${collection.channel.handle ?? collection.channel.channelId})`,
  );
  console.log(`Collected ${collection.videoCount} videos.`);

  const outPath =
    args.outPath ??
    path.join(
      process.cwd(),
      "src",
      "data",
      "ingestion",
      "raw",
      `youtube-${collection.channel.channelId}.json`,
    );

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(collection, null, 2)}\n`, "utf8");
  console.log(`Wrote collection to: ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
