/**
 * Pure domain models for public YouTube channel content.
 *
 * This layer is framework-independent: it must not import Next.js, the YouTube
 * client, or any AI/embedding code. It only describes the shape of a collected
 * video so downstream stages (cleaning, embedding, persona building) have a
 * stable contract to depend on.
 */

export interface VideoThumbnail {
  url: string;
  width: number | null;
  height: number | null;
}

export interface ChannelVideo {
  /** Platform-native video id, e.g. `dQw4w9WgXcQ`. */
  videoId: string;
  title: string;
  description: string;
  /** Original publication timestamp as ISO 8601. */
  publishedAt: string;
  /** ISO 8601 duration string as returned by the platform, e.g. `PT12M3S`. */
  duration: string;
  /** Duration flattened to whole seconds for convenient downstream use. */
  durationSeconds: number;
  /** Best available thumbnail URL, chosen by resolution. */
  thumbnailUrl: string;
  /** All thumbnail renditions the platform exposed. */
  thumbnails: VideoThumbnail[];
  /** Canonical public watch URL. */
  url: string;
}

export interface YouTubeChannel {
  channelId: string;
  title: string;
  /** Public @handle if the platform exposes one, e.g. `@chaiaurcode`. */
  handle: string | null;
  /** Playlist that contains every public upload for the channel. */
  uploadsPlaylistId: string;
  url: string;
}

/**
 * Result of collecting a channel: the resolved channel identity plus every
 * public video found, newest first.
 */
export interface ChannelVideoCollection {
  channel: YouTubeChannel;
  videos: ChannelVideo[];
  videoCount: number;
  /** When the collector fetched this data (ISO 8601). */
  collectedAt: string;
}
