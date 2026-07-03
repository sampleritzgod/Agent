import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { embedText } from "./embed-text";
import type {
  ChunkEmbedding,
  EmbeddingItemResult,
  EmbeddingSummary,
  GeneratePersonaEmbeddingsOptions,
  TranscriptChunkInput,
} from "./types";

const DEFAULT_MODEL = "text-embedding-3-small";

function readCwd(): string {
  const runtime = globalThis as { process?: { cwd?: () => string } };
  return runtime.process?.cwd?.() ?? ".";
}

function readEnv(key: string): string | undefined {
  const runtime = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.[key];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function listSubdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function isChunk(value: unknown): value is TranscriptChunkInput {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { chunkId?: unknown }).chunkId === "string" &&
    typeof (value as { videoId?: unknown }).videoId === "string" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

interface ChunkFileRef {
  videoId: string;
  chunkFile: string;
}

/**
 * Generate an OpenAI embedding for every transcript chunk of a persona and store
 * each as `<dataRoot>/embeddings/<persona>/<videoId>/<chunkId>.json`.
 *
 * Existing embeddings are skipped unless `skipExisting` is false. A single chunk
 * failing (bad file, API error) is recorded and the batch continues. This only
 * generates and stores embeddings — no retrieval, vector DB, or chat.
 */
export async function generatePersonaEmbeddings(
  options: GeneratePersonaEmbeddingsOptions,
): Promise<EmbeddingSummary> {
  const persona = options.persona?.trim();
  if (!persona) {
    throw new Error("generatePersonaEmbeddings requires a persona id.");
  }
  if (persona.includes("/") || persona.includes("\\")) {
    throw new Error(`Invalid persona id "${persona}".`);
  }

  const dataRoot = options.dataRoot ?? path.join(readCwd(), "src", "data");
  const sourceDir = options.sourceDir ?? path.join(dataRoot, "chunks", persona);
  const outputDir = path.join(dataRoot, "embeddings", persona);
  const skipExisting = options.skipExisting ?? true;
  const model = options.model ?? readEnv("OPENAI_EMBEDDING_MODEL") ?? DEFAULT_MODEL;
  const debug =
    options.debug ?? (readEnv("EMBED_DEBUG") === "1" || readEnv("EMBED_DEBUG") === "true");

  // Fail fast if the key is missing, rather than failing every chunk.
  const apiKey = options.apiKey ?? readEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env or pass options.apiKey.");
  }

  const log = (message: string): void => {
    if (debug) {
      console.log(`[embed] ${message}`);
    }
  };

  // Collect all chunk files across the persona's <videoId>/ subdirectories.
  const chunkRefs: ChunkFileRef[] = [];
  for (const videoId of await listSubdirectories(sourceDir)) {
    const videoDir = path.join(sourceDir, videoId);
    for (const chunkFile of await listJsonFiles(videoDir)) {
      chunkRefs.push({ videoId, chunkFile: path.join(videoDir, chunkFile) });
    }
  }

  await mkdir(outputDir, { recursive: true });
  log(`chunks loaded: ${chunkRefs.length} from ${sourceDir} (model=${model}, skipExisting=${skipExisting})`);

  const results: EmbeddingItemResult[] = [];

  for (const { videoId, chunkFile } of chunkRefs) {
    const chunkId = path.basename(chunkFile, ".json");
    const videoOutputDir = path.join(outputDir, videoId);
    const outputPath = path.join(videoOutputDir, `${chunkId}.json`);

    if (skipExisting && (await fileExists(outputPath))) {
      log(`skipped existing: ${videoId}/${chunkId}`);
      results.push({ chunkId, videoId, status: "skipped", reason: "already embedded" });
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(await readFile(chunkFile, "utf8"));
      if (!isChunk(parsed)) {
        throw new Error("not a valid chunk file (missing chunkId/videoId/text)");
      }
      if (!parsed.text.trim()) {
        throw new Error("chunk text is empty");
      }

      log(`embedding request started: ${videoId}/${chunkId} (${parsed.text.length} chars)`);
      const { vector, dimensions } = await embedText(parsed.text, {
        apiKey,
        model,
        ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
        ...(options.dimensions !== undefined ? { dimensions: options.dimensions } : {}),
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      log(`embedding generated: ${videoId}/${chunkId} (${dimensions} dims)`);

      const embedding: ChunkEmbedding = {
        chunkId: parsed.chunkId,
        videoId: parsed.videoId,
        persona: parsed.persona?.trim() || persona,
        text: parsed.text,
        embeddingModel: model,
        dimensions,
        vector,
        metadata: {
          language: parsed.language ?? null,
          startTime: parsed.startTime ?? null,
          endTime: parsed.endTime ?? null,
          estimatedTokens: parsed.estimatedTokens ?? null,
        },
      };

      await mkdir(videoOutputDir, { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(embedding, null, 2)}\n`, "utf8");
      log(`embedding saved: ${outputPath}`);

      results.push({ chunkId, videoId, status: "generated", filePath: outputPath });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log(`failure: ${videoId}/${chunkId}: ${reason}`);
      results.push({ chunkId, videoId, status: "failed", reason });
    }
  }

  const generated = results.filter((result) => result.status === "generated").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  const failed = results.filter((result) => result.status === "failed").length;

  return {
    persona,
    sourceDir,
    outputDir,
    model,
    total: results.length,
    processed: generated + skipped,
    skipped,
    failed,
    generated,
    results,
  };
}
