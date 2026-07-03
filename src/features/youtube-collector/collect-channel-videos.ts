import { parseChannelUrl, type ChannelRef } from "./parse-channel-url";
import { parseIsoDurationToSeconds } from "./parse-duration";
import type {
  ChannelVideo,
  ChannelVideoCollection,
  CollectChannelVideosOptions,
  VideoThumbnail,
  YouTubeChannel,
} from "./types";

const DEFAULT_BASE_URL = "https://www.googleapis.com/youtube/v3";
const PLAYLIST_PAGE_SIZE = 50;
const VIDEO_BATCH_SIZE = 50;
const CHANNEL_PARTS = "snippet,contentDetails";

/** Highest-to-lowest thumbnail resolution keys used to pick a primary image. */
const THUMBNAIL_PRIORITY = ["maxres", "standard", "high", "medium", "default"];

// --- Minimal typings for the Data API responses we read ---------------------

interface ApiThumbnail {
  url: string;
  width?: number;
  height?: number;
}

type ApiThumbnails = Record<string, ApiThumbnail | undefined>;

interface ApiChannel {
  id: string;
  snippet?: { title?: string; customUrl?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

interface ApiVideo {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: ApiThumbnails;
  };
  contentDetails?: { duration?: string };
}

interface ApiListResponse<T> {
  items?: T[];
  nextPageToken?: string;
}

interface ApiSearchResult {
  id?: { channelId?: string };
}

interface ResolvedConfig {
  apiKey: string;
  baseUrl: string;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}

function readEnv(key: string): string | undefined {
  const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return runtime.process?.env?.[key];
}

async function apiGet<T>(
  config: ResolvedConfig,
  resource: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${config.baseUrl}/${resource}`);
  url.searchParams.set("key", config.apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await config.fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      ...(config.signal ? { signal: config.signal } : {}),
    });
  } catch (cause) {
    throw new Error(`Network error calling YouTube Data API (${resource}).`, { cause });
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? detail;
    } catch {
      // keep statusText
    }
    throw new Error(
      `YouTube Data API error on ${resource} (${response.status}): ${detail}`,
    );
  }

  return (await response.json()) as T;
}

async function resolveChannel(
  config: ResolvedConfig,
  ref: ChannelRef,
): Promise<YouTubeChannel> {
  const resource = await fetchChannelResource(config, ref);
  const uploadsPlaylistId = resource.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    throw new Error(`Channel ${resource.id} does not expose an uploads playlist.`);
  }

  return {
    channelId: resource.id,
    title: resource.snippet?.title ?? resource.id,
    handle: resource.snippet?.customUrl ?? null,
    uploadsPlaylistId,
    url: `https://www.youtube.com/channel/${resource.id}`,
  };
}

async function fetchChannelResource(
  config: ResolvedConfig,
  ref: ChannelRef,
): Promise<ApiChannel> {
  switch (ref.kind) {
    case "id":
      return lookupChannel(config, { part: CHANNEL_PARTS, id: ref.value }, ref);
    case "handle":
      return lookupChannel(config, { part: CHANNEL_PARTS, forHandle: ref.value }, ref);
    case "username":
      return lookupChannel(config, { part: CHANNEL_PARTS, forUsername: ref.value }, ref);
    case "custom":
      return resolveCustomChannel(config, ref.value);
  }
}

async function lookupChannel(
  config: ResolvedConfig,
  params: Record<string, string>,
  ref: ChannelRef,
): Promise<ApiChannel> {
  const response = await apiGet<ApiListResponse<ApiChannel>>(config, "channels", params);
  const item = response.items?.[0];
  if (!item) {
    throw new Error(`No channel found for ${ref.kind} "${ref.value}".`);
  }
  return item;
}

async function resolveCustomChannel(
  config: ResolvedConfig,
  slug: string,
): Promise<ApiChannel> {
  const search = await apiGet<ApiListResponse<ApiSearchResult>>(config, "search", {
    part: "snippet",
    type: "channel",
    q: slug,
    maxResults: 1,
  });
  const channelId = search.items?.[0]?.id?.channelId;
  if (!channelId) {
    throw new Error(`No channel found for custom URL "${slug}".`);
  }
  return lookupChannel(config, { part: CHANNEL_PARTS, id: channelId }, {
    kind: "id",
    value: channelId,
  });
}

async function collectUploadVideoIds(
  config: ResolvedConfig,
  uploadsPlaylistId: string,
  limit?: number,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const response = await apiGet<ApiListResponse<{ contentDetails?: { videoId?: string } }>>(
      config,
      "playlistItems",
      {
        part: "contentDetails",
        playlistId: uploadsPlaylistId,
        maxResults: PLAYLIST_PAGE_SIZE,
        pageToken,
      },
    );

    for (const item of response.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      if (videoId) {
        ids.push(videoId);
        if (limit !== undefined && ids.length >= limit) {
          return ids;
        }
      }
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  return ids;
}

async function fetchVideos(
  config: ResolvedConfig,
  videoIds: string[],
): Promise<ChannelVideo[]> {
  const videos: ChannelVideo[] = [];

  for (let start = 0; start < videoIds.length; start += VIDEO_BATCH_SIZE) {
    const batch = videoIds.slice(start, start + VIDEO_BATCH_SIZE);
    const response = await apiGet<ApiListResponse<ApiVideo>>(config, "videos", {
      part: "snippet,contentDetails",
      id: batch.join(","),
      maxResults: VIDEO_BATCH_SIZE,
    });

    for (const resource of response.items ?? []) {
      videos.push(toChannelVideo(resource));
    }
  }

  return videos;
}

function mapThumbnails(thumbnails?: ApiThumbnails): VideoThumbnail[] {
  if (!thumbnails) {
    return [];
  }

  return Object.values(thumbnails)
    .filter((thumb): thumb is ApiThumbnail => Boolean(thumb?.url))
    .map((thumb) => ({
      url: thumb.url,
      width: thumb.width ?? null,
      height: thumb.height ?? null,
    }));
}

function pickPrimaryThumbnail(thumbnails?: ApiThumbnails): string {
  if (!thumbnails) {
    return "";
  }

  for (const key of THUMBNAIL_PRIORITY) {
    const url = thumbnails[key]?.url;
    if (url) {
      return url;
    }
  }

  return Object.values(thumbnails).find((thumb) => thumb?.url)?.url ?? "";
}

function toChannelVideo(resource: ApiVideo): ChannelVideo {
  const duration = resource.contentDetails?.duration ?? "";

  return {
    videoId: resource.id,
    title: resource.snippet?.title ?? "",
    description: resource.snippet?.description ?? "",
    publishedAt: resource.snippet?.publishedAt ?? "",
    duration,
    durationSeconds: parseIsoDurationToSeconds(duration),
    thumbnailUrl: pickPrimaryThumbnail(resource.snippet?.thumbnails),
    thumbnails: mapThumbnails(resource.snippet?.thumbnails),
    url: `https://www.youtube.com/watch?v=${resource.id}`,
  };
}

/**
 * Collect every public video (metadata only) from a YouTube channel via the
 * Data API v3. Pipeline: parse URL → resolve channel + uploads playlist → page
 * playlist for video ids → batch-fetch video metadata.
 */
export async function collectChannelVideos(
  channelUrl: string,
  options: CollectChannelVideosOptions = {},
): Promise<ChannelVideoCollection> {
  const trimmedUrl = channelUrl?.trim();
  if (!trimmedUrl) {
    throw new Error("A YouTube channel URL is required.");
  }

  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit <= 0)) {
    throw new Error("`limit` must be a positive integer when provided.");
  }

  const apiKey = options.apiKey ?? readEnv("YOUTUBE_API_KEY");
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is not set. Provide it via env or options.apiKey.");
  }

  const config: ResolvedConfig = {
    apiKey,
    baseUrl: (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
    fetchImpl: options.fetchImpl ?? fetch,
    ...(options.signal ? { signal: options.signal } : {}),
  };

  const ref = parseChannelUrl(trimmedUrl);
  const channel = await resolveChannel(config, ref);
  const videoIds = await collectUploadVideoIds(config, channel.uploadsPlaylistId, options.limit);
  const videos = await fetchVideos(config, videoIds);

  return {
    channel,
    videos,
    videoCount: videos.length,
    collectedAt: new Date().toISOString(),
  };
}
