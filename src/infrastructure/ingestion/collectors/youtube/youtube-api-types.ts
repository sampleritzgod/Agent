/**
 * Minimal typings for the subset of the YouTube Data API v3 responses this
 * collector consumes. These intentionally model only the fields we read.
 */

export interface YouTubeThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export type YouTubeThumbnails = Record<string, YouTubeThumbnail | undefined>;

export interface YouTubePageInfo {
  totalResults?: number;
  resultsPerPage?: number;
}

export interface YouTubeChannelResource {
  id: string;
  snippet?: {
    title?: string;
    customUrl?: string;
  };
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string;
    };
  };
}

export interface YouTubeChannelListResponse {
  items?: YouTubeChannelResource[];
  pageInfo?: YouTubePageInfo;
}

export interface YouTubePlaylistItemResource {
  contentDetails?: {
    videoId?: string;
  };
}

export interface YouTubePlaylistItemsResponse {
  items?: YouTubePlaylistItemResource[];
  nextPageToken?: string;
  pageInfo?: YouTubePageInfo;
}

export interface YouTubeVideoResource {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: YouTubeThumbnails;
  };
  contentDetails?: {
    duration?: string;
  };
}

export interface YouTubeVideoListResponse {
  items?: YouTubeVideoResource[];
}

export interface YouTubeSearchResultResource {
  id?: {
    channelId?: string;
  };
}

export interface YouTubeSearchListResponse {
  items?: YouTubeSearchResultResource[];
}
