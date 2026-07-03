import type { YouTubeCollectorConfig } from "@/config/youtube";

import { YouTubeDataApiClient } from "./youtube-data-api-client";
import { YouTubeVideoCollector } from "./youtube-video-collector";

export { YouTubeVideoCollector } from "./youtube-video-collector";
export { YouTubeDataApiClient } from "./youtube-data-api-client";
export { YouTubeChannelResolver } from "./youtube-channel-resolver";
export { YouTubeCollectorError } from "./youtube-collector-error";
export { parseChannelUrl } from "./parse-channel-url";
export type { ChannelRef } from "./parse-channel-url";
export { parseIsoDurationToSeconds } from "./parse-duration";

/**
 * Convenience factory: build a fully wired YouTube collector from config.
 * The returned value satisfies the application `ChannelVideoSource` port.
 */
export function createYouTubeCollector(
  config: YouTubeCollectorConfig,
  fetchImpl?: typeof fetch,
): YouTubeVideoCollector {
  const client = new YouTubeDataApiClient({
    apiKey: config.apiKey,
    baseUrl: config.apiBaseUrl,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  return new YouTubeVideoCollector(client);
}
