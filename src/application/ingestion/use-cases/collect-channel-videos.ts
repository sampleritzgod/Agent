import type { ChannelVideoCollection } from "@/domain/content-sources/channel-video";

import type {
  ChannelVideoSource,
  CollectChannelVideosOptions,
} from "../ports/channel-video-source";

export interface CollectChannelVideosInput {
  channelUrl: string;
  limit?: number;
  signal?: AbortSignal;
}

/**
 * Application use case: given a YouTube channel URL, collect its public videos.
 *
 * It validates input, then delegates the actual fetching to whatever
 * {@link ChannelVideoSource} is injected. Because it depends on the port and not
 * a concrete client, the use case stays testable and completely independent of
 * the AI layer, transcript extraction, and embeddings.
 */
export async function collectChannelVideos(
  source: ChannelVideoSource,
  input: CollectChannelVideosInput,
): Promise<ChannelVideoCollection> {
  const channelUrl = input.channelUrl?.trim();
  if (!channelUrl) {
    throw new Error("A YouTube channel URL is required.");
  }

  const options: CollectChannelVideosOptions = {};

  if (input.limit !== undefined) {
    if (!Number.isInteger(input.limit) || input.limit <= 0) {
      throw new Error("`limit` must be a positive integer when provided.");
    }
    options.limit = input.limit;
  }

  if (input.signal) {
    options.signal = input.signal;
  }

  return source.collectFromUrl(channelUrl, options);
}
