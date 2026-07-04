import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { RecommendVideosOptions, VideoRecommendation } from "./types";

interface RawChannelVideo {
  videoId?: unknown;
  title?: unknown;
  description?: unknown;
  publishedAt?: unknown;
  url?: unknown;
}

interface RawCollection {
  channel?: { handle?: unknown; title?: unknown };
  videos?: unknown;
}

const DEFAULT_LIMIT = 3;

/**
 * Handle/title tokens that identify which ingestion file belongs to which
 * persona. Matching is done on the collection's channel handle and title, so no
 * channel IDs are hard-coded and new personas only need an entry here.
 */
const PERSONA_CHANNEL_TOKENS: Record<string, string[]> = {
  hitesh: ["chaiaurcode", "hiteshchoudhary", "hitesh", "chai aur code"],
  piyush: ["piyushgargdev", "piyushgarg", "piyush"],
};

/**
 * Phrases/keywords that signal the user wants videos, playlists, tutorials,
 * latest uploads, or learning resources — in English and Hinglish.
 */
const VIDEO_INTENT_PATTERN =
  /\b(video|videos|vdo|playlist|playlists|tutorial|tutorials|lecture|lectures|course|courses|series|upload|uploads|watch|channel|resource|resources|content|dekh|dekho|dekhna|dekhau|dekhna|milega|milegi|sikha|sikhna|seekh|seekhna|padha|padhna)\b/i;

const INTENT_STOPWORDS = new Set([
  "video", "videos", "vdo", "playlist", "playlists", "tutorial", "tutorials",
  "lecture", "lectures", "course", "courses", "series", "upload", "uploads",
  "watch", "channel", "resource", "resources", "content", "latest", "new",
  "newest", "recent", "recently", "best", "top", "good", "some", "any", "show",
  "recommend", "suggestion", "suggestions", "link", "links", "sir", "please",
  "dekh", "dekho", "dekhna", "dekhau", "milega", "milegi", "sikha", "sikhna",
  "seekh", "seekhna", "padha", "padhna", "koi", "kuch", "mujhe", "muje", "mera",
  "meri", "aap", "ka", "ke", "ki", "ko", "hai", "hain", "ho", "kya", "kaun",
  "kaunsa", "konsa", "and", "or", "the", "a", "an", "of", "on", "for", "to",
  "me", "my", "you", "your", "is", "are", "with", "about", "give", "get",
]);

const RECENT_PATTERN = /\b(latest|newest|recent|recently|new)\b/i;

let cache: Map<string, { videos: RawChannelVideo[] } | null> | undefined;

function readCwd(): string {
  const runtime = globalThis as { process?: { cwd?: () => string } };
  return runtime.process?.cwd?.() ?? ".";
}

/** True when the user is asking for videos/tutorials/playlists/resources. */
export function detectVideoIntent(message: string): boolean {
  return VIDEO_INTENT_PATTERN.test(message);
}

function tokenize(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Meaningful topic terms: drop intent/stopwords so ranking focuses on the topic. */
function queryTerms(query: string): string[] {
  const terms = tokenize(query).filter(
    (t) => t.length > 1 && !INTENT_STOPWORDS.has(t),
  );
  return [...new Set(terms)];
}

/** Promotional/boilerplate line starts that make poor description snippets. */
const PROMO_LINE_PATTERN =
  /^(visit|in paid collab|welcome to|all source code|join me|for community|get your|buy book|coupon|use coupon|instagram|discord|whatsapp|source code|diagram link|code used|check out|sponsor|#)/i;

/**
 * Strip URLs and boilerplate, then take a short, readable snippet: the first
 * substantive line, falling back to the cleaned full text.
 */
function shortDescription(description: string, maxChars = 160): string {
  const lines = description
    .split(/\r?\n/)
    .map((line) => line.replace(/https?:\/\/\S+/g, "").trim())
    .filter((line) => line.length > 0);

  const substantive = lines.find(
    (line) =>
      line.length >= 25 &&
      // Skip timestamp/index lines like "0:00 Intro" and promo boilerplate.
      !/^\d{1,2}:\d{2}(:\d{2})?\b/.test(line) &&
      !PROMO_LINE_PATTERN.test(line),
  );

  const fallback = lines.find((line) => !/^\d{1,2}:\d{2}(:\d{2})?\b/.test(line)) ?? "";
  const cleaned = (substantive ?? fallback).replace(/\s+/g, " ").trim();

  if (cleaned.length <= maxChars) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxChars).trimEnd()}…`;
}

async function findPersonaFile(rawDir: string, persona: string): Promise<string | null> {
  const tokens = PERSONA_CHANNEL_TOKENS[persona.toLowerCase()];
  if (!tokens) {
    return null;
  }

  let entries: string[];
  try {
    entries = (await readdir(rawDir)).filter(
      (name) => name.startsWith("youtube-") && name.toLowerCase().endsWith(".json"),
    );
  } catch {
    return null;
  }

  for (const name of entries) {
    const filePath = path.join(rawDir, name);
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8")) as RawCollection;
      const handle = typeof parsed.channel?.handle === "string" ? parsed.channel.handle : "";
      const title = typeof parsed.channel?.title === "string" ? parsed.channel.title : "";
      const haystack = `${handle} ${title}`.toLowerCase().replace(/[@\s]/g, "");
      if (tokens.some((token) => haystack.includes(token.replace(/\s/g, "")))) {
        return filePath;
      }
    } catch {
      // Ignore unreadable/malformed files and keep scanning.
    }
  }
  return null;
}

async function loadPersonaVideos(
  persona: string,
  dataRoot: string,
): Promise<RawChannelVideo[]> {
  const rawDir = path.join(dataRoot, "ingestion", "raw");
  const filePath = await findPersonaFile(rawDir, persona);
  if (!filePath) {
    return [];
  }

  cache ??= new Map();
  if (cache.has(filePath)) {
    return cache.get(filePath)?.videos ?? [];
  }

  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as RawCollection;
    const videos = Array.isArray(parsed.videos) ? (parsed.videos as RawChannelVideo[]) : [];
    cache.set(filePath, { videos });
    return videos;
  } catch {
    cache.set(filePath, null);
    return [];
  }
}

function toRecommendation(video: RawChannelVideo): VideoRecommendation | null {
  if (typeof video.videoId !== "string" || typeof video.title !== "string") {
    return null;
  }
  const url =
    typeof video.url === "string" && video.url
      ? video.url
      : `https://www.youtube.com/watch?v=${video.videoId}`;
  const description = typeof video.description === "string" ? video.description : "";
  return {
    videoId: video.videoId,
    title: video.title,
    url,
    description: shortDescription(description),
  };
}

/**
 * Recommend up to `limit` of the creator's own videos matching the user's query,
 * searched over title + description from the existing local ingestion JSON.
 * No YouTube API calls and no scraping — purely local file reads.
 */
export async function recommendVideos(
  options: RecommendVideosOptions,
): Promise<VideoRecommendation[]> {
  const persona = options.persona?.trim();
  if (!persona) {
    return [];
  }

  const dataRoot = options.dataRoot ?? path.join(readCwd(), "src", "data");
  const limit = options.limit ?? DEFAULT_LIMIT;
  const preferRecent = options.preferRecent ?? RECENT_PATTERN.test(options.query);

  const videos = await loadPersonaVideos(persona, dataRoot);
  if (videos.length === 0) {
    return [];
  }

  const terms = queryTerms(options.query);

  const scored = videos
    .map((video) => {
      const title = typeof video.title === "string" ? video.title.toLowerCase() : "";
      const description =
        typeof video.description === "string" ? video.description.toLowerCase() : "";
      const publishedAt =
        typeof video.publishedAt === "string" ? video.publishedAt : "";

      let score = 0;
      for (const term of terms) {
        // Title matches weigh far more than description matches.
        if (title.includes(term)) score += 5;
        if (description.includes(term)) score += 1;
      }
      return { video, score, publishedAt };
    })
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Tie-break by recency (ISO timestamps sort lexicographically).
    return b.publishedAt.localeCompare(a.publishedAt);
  });

  // With no meaningful topic terms but a clear "latest videos" ask, fall back to
  // the newest uploads so the persona can still recommend something relevant.
  let chosen = scored;
  if (chosen.length === 0 && terms.length === 0 && preferRecent) {
    chosen = [...videos]
      .map((video) => ({
        video,
        score: 0,
        publishedAt: typeof video.publishedAt === "string" ? video.publishedAt : "",
      }))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  const recommendations: VideoRecommendation[] = [];
  for (const entry of chosen) {
    const rec = toRecommendation(entry.video);
    if (rec) {
      recommendations.push(rec);
    }
    if (recommendations.length >= limit) {
      break;
    }
  }
  return recommendations;
}

/**
 * Build the system-prompt block that instructs the persona to recommend the
 * given videos in-character. When there are no matches, returns guidance to say
 * so honestly without inventing links. Returns "" only for an empty input that
 * should not be injected.
 */
export function formatVideoBlock(recommendations: VideoRecommendation[]): string {
  if (recommendations.length === 0) {
    return [
      "# Video Recommendations",
      "",
      "The user is asking for videos, tutorials, playlists, or learning resources,",
      "but no relevant video was found in your local video library for this topic.",
      "Tell them naturally and in character that you couldn't find a matching video",
      "in your available list. Do NOT invent video titles, playlists, or links.",
    ].join("\n");
  }

  const list = recommendations
    .map((rec) =>
      [`- Title: ${rec.title}`, `  URL: ${rec.url}`, rec.description ? `  About: ${rec.description}` : ""]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");

  return [
    "# Video Recommendations (from the creator's own library)",
    "",
    "The user is asking for videos/tutorials/playlists/resources. Recommend the",
    "following ACTUAL videos from the creator's library, in your own voice and",
    "teaching style. Use the exact titles and URLs as given — present them as a",
    "short, friendly list. Do NOT invent any other videos, playlists, or links,",
    "and do NOT include videos that are not listed here.",
    "",
    list,
  ].join("\n");
}
