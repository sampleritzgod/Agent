import { YouTubeCollectorError } from "@/infrastructure/ingestion/collectors/youtube/youtube-collector-error";

export interface YouTubeCollectorConfig {
  apiKey: string;
  apiBaseUrl: string;
}

export type EnvSource = Record<string, string | undefined>;

function readProcessEnv(): EnvSource {
  const runtime = globalThis as { process?: { env?: EnvSource } };
  return runtime.process?.env ?? {};
}

/**
 * Reads the YouTube collector configuration from the environment.
 *
 * Secrets are only ever read here (per the architecture rules) and passed
 * explicitly into the collector, so no other module touches the environment.
 */
export function loadYouTubeCollectorConfig(
  env: EnvSource = readProcessEnv(),
): YouTubeCollectorConfig {
  const apiKey = env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    throw new YouTubeCollectorError(
      "CONFIG_ERROR",
      "YOUTUBE_API_KEY is not set. Add it to your environment to collect channel videos.",
    );
  }

  return {
    apiKey,
    apiBaseUrl:
      env.YOUTUBE_API_BASE_URL?.trim() || "https://www.googleapis.com/youtube/v3",
  };
}
