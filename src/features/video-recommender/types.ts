export interface VideoRecommendation {
  videoId: string;
  title: string;
  url: string;
  /** Cleaned, shortened description (URLs/timestamps removed). */
  description: string;
}

export interface RecommendVideosOptions {
  /** Persona id (e.g. "hitesh", "piyush") — selects which ingestion file to search. */
  persona: string;
  /** The user message; used to rank videos by relevance. */
  query: string;
  /** Max recommendations to return. Defaults to 3. */
  limit?: number;
  /** Base data directory. Defaults to `<cwd>/src/data`. */
  dataRoot?: string;
  /** Prefer the newest matching videos (for "latest"/"recent" style asks). */
  preferRecent?: boolean;
}
