import type {
  ChannelVideo,
  ChannelVideoCollection,
  VideoThumbnail,
  YouTubeChannel,
} from "@/domain/content-sources/channel-video";
import type {
  ChannelVideoSource,
  CollectChannelVideosOptions,
} from "@/application/ingestion/ports/channel-video-source";

import { parseChannelUrl } from "./parse-channel-url";
import { parseIsoDurationToSeconds } from "./parse-duration";
import type {
  YouTubeThumbnails,
  YouTubeVideoResource,
} from "./youtube-api-types";
import type { YouTubeDataApiClient } from "./youtube-data-api-client";
import { YouTubeChannelResolver } from "./youtube-channel-resolver";

const PLAYLIST_PAGE_SIZE = 50;
const VIDEO_BATCH_SIZE = 50;

/** Highest-to-lowest thumbnail resolution keys used to pick a primary image. */
const THUMBNAIL_PRIORITY = ["maxres", "standard", "high", "medium", "default"];

/**
 * Collects every public video from a YouTube channel via the Data API v3.
 *
 * Pipeline:
 *  1. Parse the channel URL into a reference.
 *  2. Resolve the channel and its uploads playlist.
 *  3. Page through the uploads playlist to gather all video ids.
 *  4. Batch-fetch video metadata (title, description, dates, duration, thumbs).
 *
 * It implements {@link ChannelVideoSource} and has zero knowledge of transcripts,
 * embeddings, or the AI system.
 */
export class YouTubeVideoCollector implements ChannelVideoSource {
  private readonly resolver: YouTubeChannelResolver;

  constructor(private readonly client: YouTubeDataApiClient) {
    this.resolver = new YouTubeChannelResolver(client);
  }

  async collectFromUrl(
    channelUrl: string,
    options: CollectChannelVideosOptions = {},
  ): Promise<ChannelVideoCollection> {
    const ref = parseChannelUrl(channelUrl);
    const channel = await this.resolver.resolve(ref, options.signal);

    const videoIds = await this.collectUploadVideoIds(
      channel.uploadsPlaylistId,
      options,
    );
    const videos = await this.fetchVideos(videoIds, options.signal);

    return {
      channel,
      videos,
      videoCount: videos.length,
      collectedAt: new Date().toISOString(),
    };
  }

  private async collectUploadVideoIds(
    uploadsPlaylistId: string,
    options: CollectChannelVideosOptions,
  ): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.client.listPlaylistItems(
        {
          part: "contentDetails",
          playlistId: uploadsPlaylistId,
          maxResults: PLAYLIST_PAGE_SIZE,
          pageToken,
        },
        options.signal,
      );

      for (const item of response.items ?? []) {
        const videoId = item.contentDetails?.videoId;
        if (videoId) {
          ids.push(videoId);
          if (options.limit !== undefined && ids.length >= options.limit) {
            return ids;
          }
        }
      }

      pageToken = response.nextPageToken;
    } while (pageToken);

    return ids;
  }

  private async fetchVideos(
    videoIds: string[],
    signal?: AbortSignal,
  ): Promise<ChannelVideo[]> {
    const videos: ChannelVideo[] = [];

    for (let start = 0; start < videoIds.length; start += VIDEO_BATCH_SIZE) {
      const batch = videoIds.slice(start, start + VIDEO_BATCH_SIZE);
      const response = await this.client.listVideos(
        {
          part: "snippet,contentDetails",
          id: batch.join(","),
          maxResults: VIDEO_BATCH_SIZE,
        },
        signal,
      );

      for (const resource of response.items ?? []) {
        videos.push(this.toChannelVideo(resource));
      }
    }

    return videos;
  }

  private toChannelVideo(resource: YouTubeVideoResource): ChannelVideo {
    const duration = resource.contentDetails?.duration ?? "";
    const thumbnails = mapThumbnails(resource.snippet?.thumbnails);

    return {
      videoId: resource.id,
      title: resource.snippet?.title ?? "",
      description: resource.snippet?.description ?? "",
      publishedAt: resource.snippet?.publishedAt ?? "",
      duration,
      durationSeconds: parseIsoDurationToSeconds(duration),
      thumbnailUrl: pickPrimaryThumbnail(resource.snippet?.thumbnails),
      thumbnails,
      url: `https://www.youtube.com/watch?v=${resource.id}`,
    };
  }
}

function mapThumbnails(thumbnails?: YouTubeThumbnails): VideoThumbnail[] {
  if (!thumbnails) {
    return [];
  }

  return Object.values(thumbnails)
    .filter((thumb): thumb is NonNullable<typeof thumb> => Boolean(thumb?.url))
    .map((thumb) => ({
      url: thumb.url,
      width: thumb.width ?? null,
      height: thumb.height ?? null,
    }));
}

function pickPrimaryThumbnail(thumbnails?: YouTubeThumbnails): string {
  if (!thumbnails) {
    return "";
  }

  for (const key of THUMBNAIL_PRIORITY) {
    const url = thumbnails[key]?.url;
    if (url) {
      return url;
    }
  }

  const fallback = Object.values(thumbnails).find((thumb) => thumb?.url);
  return fallback?.url ?? "";
}
