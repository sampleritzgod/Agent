import type { YouTubeChannel } from "@/domain/content-sources/channel-video";

import type { ChannelRef } from "./parse-channel-url";
import type { YouTubeChannelResource } from "./youtube-api-types";
import type { YouTubeDataApiClient } from "./youtube-data-api-client";
import { YouTubeCollectorError } from "./youtube-collector-error";

const CHANNEL_PARTS = "snippet,contentDetails";

/**
 * Resolves a {@link ChannelRef} to a concrete {@link YouTubeChannel}, including
 * the uploads playlist id that every public video lives in.
 */
export class YouTubeChannelResolver {
  constructor(private readonly client: YouTubeDataApiClient) {}

  async resolve(ref: ChannelRef, signal?: AbortSignal): Promise<YouTubeChannel> {
    const resource = await this.fetchChannelResource(ref, signal);
    const uploadsPlaylistId = resource.contentDetails?.relatedPlaylists?.uploads;

    if (!uploadsPlaylistId) {
      throw new YouTubeCollectorError(
        "CHANNEL_NOT_FOUND",
        `Channel ${resource.id} does not expose an uploads playlist.`,
      );
    }

    return {
      channelId: resource.id,
      title: resource.snippet?.title ?? resource.id,
      handle: resource.snippet?.customUrl ?? null,
      uploadsPlaylistId,
      url: `https://www.youtube.com/channel/${resource.id}`,
    };
  }

  private async fetchChannelResource(
    ref: ChannelRef,
    signal?: AbortSignal,
  ): Promise<YouTubeChannelResource> {
    switch (ref.kind) {
      case "id":
        return this.getByLookup({ part: CHANNEL_PARTS, id: ref.value }, ref, signal);
      case "handle":
        return this.getByLookup(
          { part: CHANNEL_PARTS, forHandle: ref.value },
          ref,
          signal,
        );
      case "username":
        return this.getByLookup(
          { part: CHANNEL_PARTS, forUsername: ref.value },
          ref,
          signal,
        );
      case "custom":
        return this.resolveCustom(ref.value, signal);
    }
  }

  private async getByLookup(
    params: Record<string, string>,
    ref: ChannelRef,
    signal?: AbortSignal,
  ): Promise<YouTubeChannelResource> {
    const response = await this.client.listChannels(params, signal);
    const item = response.items?.[0];
    if (!item) {
      throw new YouTubeCollectorError(
        "CHANNEL_NOT_FOUND",
        `No channel found for ${ref.kind} "${ref.value}".`,
      );
    }
    return item;
  }

  /**
   * Legacy custom URLs (/c/Name or bare slugs) cannot be looked up directly, so
   * we search for the channel and then re-fetch it by id to get full details.
   */
  private async resolveCustom(
    slug: string,
    signal?: AbortSignal,
  ): Promise<YouTubeChannelResource> {
    const search = await this.client.searchChannels(
      { part: "snippet", type: "channel", q: slug, maxResults: 1 },
      signal,
    );
    const channelId = search.items?.[0]?.id?.channelId;
    if (!channelId) {
      throw new YouTubeCollectorError(
        "CHANNEL_NOT_FOUND",
        `No channel found for custom URL "${slug}".`,
      );
    }
    return this.getByLookup(
      { part: CHANNEL_PARTS, id: channelId },
      { kind: "id", value: channelId },
      signal,
    );
  }
}
