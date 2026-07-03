import type { EmbedTextOptions, EmbedTextResult } from "./types";

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

function readEnv(key: string): string | undefined {
  const runtime = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.[key];
}

interface EmbeddingApiResponse {
  data?: Array<{ embedding?: number[] }>;
  model?: string;
}

/**
 * Generate an embedding for a single string via the OpenAI embeddings API.
 * Reads `OPENAI_API_KEY` from the environment by default. Throws on missing
 * key, empty input, non-2xx responses, or an empty vector — callers isolate
 * per-chunk failures so a single bad chunk doesn't abort a batch.
 */
export async function embedText(
  text: string,
  options: EmbedTextOptions = {},
): Promise<EmbedTextResult> {
  const input = text?.trim();
  if (!input) {
    throw new Error("embedText requires non-empty text.");
  }

  const apiKey = options.apiKey ?? readEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Provide it via env or options.apiKey.");
  }

  const model = options.model ?? readEnv("OPENAI_EMBEDDING_MODEL") ?? DEFAULT_MODEL;
  const baseUrl = (
    options.baseUrl ??
    readEnv("OPENAI_API_BASE_URL") ??
    DEFAULT_BASE_URL
  ).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const organization = options.organization ?? readEnv("OPENAI_ORGANIZATION");
  const project = options.project ?? readEnv("OPENAI_PROJECT");

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (organization) {
    headers["openai-organization"] = organization;
  }
  if (project) {
    headers["openai-project"] = project;
  }

  const body: Record<string, unknown> = { model, input };
  if (options.dimensions !== undefined) {
    body.dimensions = options.dimensions;
  }

  const response = await fetchImpl(`${baseUrl}/embeddings`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`OpenAI embeddings request failed (${response.status}): ${detail}`);
  }

  const payload = (await response.json()) as EmbeddingApiResponse;
  const vector = payload.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error("OpenAI returned no embedding vector.");
  }

  return { vector, model: payload.model ?? model, dimensions: vector.length };
}
