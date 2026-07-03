export interface VideoThumbnail {
  url: string;
  width: number | null;
  height: number | null;
}

export interface ChannelVideo {
  videoId: string;
  title: string;
  description: string;
  /** Original publication timestamp as ISO 8601. */
  publishedAt: string;
  /** ISO 8601 duration string as returned by YouTube, e.g. `PT12M3S`. */
  duration: string;
  durationSeconds: number;
  /** Best available thumbnail URL, chosen by resolution. */
  thumbnailUrl: string;
  thumbnails: VideoThumbnail[];
  url: string;
}

export interface YouTubeChannel {
  channelId: string;
  title: string;
  handle: string | null;
  uploadsPlaylistId: string;
  url: string;
}

export interface ChannelVideoCollection {
  channel: YouTubeChannel;
  videos: ChannelVideo[];
  videoCount: number;
  collectedAt: string;
}

export interface CollectChannelVideosOptions {
  /** Defaults to `YOUTUBE_API_KEY`. */
  apiKey?: string;
  /** Cap the number of videos collected. Omit to collect every public upload. */
  limit?: number;
  /** Defaults to the public Data API v3 base URL. */
  baseUrl?: string;
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}
