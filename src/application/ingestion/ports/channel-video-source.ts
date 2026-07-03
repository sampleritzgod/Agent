import type { ChannelVideoCollection } from "@/domain/content-sources/channel-video";

/**
 * Options that tune a single collection run.
 */
export interface CollectChannelVideosOptions {
  /**
   * Optional cap on how many videos to collect. Omit to collect every public
   * video on the channel. Useful for smoke tests or incremental sampling.
   */
  limit?: number;
  /** Allows the caller to cancel an in-flight collection. */
  signal?: AbortSignal;
}

/**
 * Port for any source that can turn a channel URL into a set of public videos.
 *
 * The application layer depends only on this interface; concrete adapters (e.g.
 * the YouTube Data API collector) live in `src/infrastructure` and implement it.
 * This keeps the ingestion use cases free of any vendor SDK and free of the AI
 * system entirely.
 */
export interface ChannelVideoSource {
  collectFromUrl(
    channelUrl: string,
    options?: CollectChannelVideosOptions,
  ): Promise<ChannelVideoCollection>;
}
