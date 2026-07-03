/**
 * Operational script: collect all public videos from a YouTube channel and
 * write the raw collection to disk. Deliberately AI-free — no transcripts, no
 * embeddings, no OpenAI. It only exercises the ingestion collector.
 *
 * Usage:
 *   YOUTUBE_API_KEY=... tsx scripts/ingestion/collect-youtube.ts <channelUrl> [--limit N] [--out path]
 *
 * Example:
 *   YOUTUBE_API_KEY=... tsx scripts/ingestion/collect-youtube.ts https://www.youtube.com/@chaiaurcode
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadYouTubeCollectorConfig } from "@/config/youtube";
import { collectChannelVideos } from "@/application/ingestion/use-cases/collect-channel-videos";
import { createYouTubeCollector } from "@/infrastructure/ingestion/collectors/youtube";

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
      "Missing channel URL.\nUsage: tsx scripts/ingestion/collect-youtube.ts <channelUrl> [--limit N] [--out path]",
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
  const config = loadYouTubeCollectorConfig();
  const collector = createYouTubeCollector(config);

  console.log(`Collecting videos from: ${args.channelUrl}`);
  const collection = await collectChannelVideos(collector, {
    channelUrl: args.channelUrl,
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
