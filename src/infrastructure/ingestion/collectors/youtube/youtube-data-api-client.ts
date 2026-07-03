import { YouTubeCollectorError } from "./youtube-collector-error";
import type {
  YouTubeChannelListResponse,
  YouTubePlaylistItemsResponse,
  YouTubeSearchListResponse,
  YouTubeVideoListResponse,
} from "./youtube-api-types";

export interface YouTubeDataApiClientConfig {
  apiKey: string;
  /** Defaults to the public Data API v3 base URL. */
  baseUrl?: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

type QueryParams = Record<string, string | number | undefined>;

/**
 * Thin, dependency-free wrapper over the YouTube Data API v3.
 *
 * It only knows how to authenticate and issue GET requests; it holds no
 * ingestion or persona logic. Higher-level services compose these calls.
 */
export class YouTubeDataApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: YouTubeDataApiClientConfig) {
    if (!config.apiKey) {
      throw new YouTubeCollectorError(
        "CONFIG_ERROR",
        "A YouTube Data API key is required.",
      );
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? "https://www.googleapis.com/youtube/v3").replace(
      /\/$/,
      "",
    );
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async listChannels(
    params: QueryParams,
    signal?: AbortSignal,
  ): Promise<YouTubeChannelListResponse> {
    return this.request<YouTubeChannelListResponse>("channels", params, signal);
  }

  async listPlaylistItems(
    params: QueryParams,
    signal?: AbortSignal,
  ): Promise<YouTubePlaylistItemsResponse> {
    return this.request<YouTubePlaylistItemsResponse>("playlistItems", params, signal);
  }

  async listVideos(
    params: QueryParams,
    signal?: AbortSignal,
  ): Promise<YouTubeVideoListResponse> {
    return this.request<YouTubeVideoListResponse>("videos", params, signal);
  }

  async searchChannels(
    params: QueryParams,
    signal?: AbortSignal,
  ): Promise<YouTubeSearchListResponse> {
    return this.request<YouTubeSearchListResponse>("search", params, signal);
  }

  private async request<T>(
    resource: string,
    params: QueryParams,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${resource}`);
    url.searchParams.set("key", this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        ...(signal ? { signal } : {}),
      });
    } catch (cause) {
      throw new YouTubeCollectorError(
        "API_ERROR",
        `Network error calling YouTube Data API (${resource}).`,
        { cause },
      );
    }

    if (!response.ok) {
      const detail = await this.extractErrorMessage(response);
      throw new YouTubeCollectorError(
        "API_ERROR",
        `YouTube Data API error on ${resource} (${response.status}): ${detail}`,
      );
    }

    return (await response.json()) as T;
  }

  private async extractErrorMessage(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      return body.error?.message ?? response.statusText;
    } catch {
      return response.statusText;
    }
  }
}
