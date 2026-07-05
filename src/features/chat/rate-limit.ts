import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/** Maximum chat requests allowed per IP within the sliding window. */
export const CHAT_RATE_LIMIT_REQUESTS = 10;

/** Sliding window duration — 10 requests per hour per IP. */
export const CHAT_RATE_LIMIT_WINDOW = "1 h" as const;

/** JSON body returned when an IP exceeds the chat rate limit. */
export const RATE_LIMIT_EXCEEDED_BODY = {
  error: "RATE_LIMIT_EXCEEDED",
  message: "Too many requests. Please try again later.",
} as const;

let ratelimit: Ratelimit | null | undefined;
let warnedMissingCredentials = false;

function readEnv(name: string): string | undefined {
  const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return runtime.process?.env?.[name]?.trim() || undefined;
}

/**
 * Lazily create the Upstash rate limiter. Returns `null` when credentials are
 * missing so the app keeps working locally without Redis — a one-time warning is
 * logged and every request is allowed through.
 */
function getRateLimiter(): Ratelimit | null {
  if (ratelimit !== undefined) {
    return ratelimit;
  }

  const url = readEnv("UPSTASH_REDIS_REST_URL");
  const token = readEnv("UPSTASH_REDIS_REST_TOKEN");

  if (!url || !token) {
    if (!warnedMissingCredentials) {
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set — " +
          "IP rate limiting is disabled for /api/chat.",
      );
      warnedMissingCredentials = true;
    }
    ratelimit = null;
    return null;
  }

  const redis = new Redis({ url, token });
  const prefix = readEnv("RATE_LIMIT_REDIS_PREFIX") ?? "persona-chat";

  ratelimit = new Ratelimit({
    redis,
    // Sliding window: smooth hourly cap instead of a hard reset at the top of each hour.
    limiter: Ratelimit.slidingWindow(CHAT_RATE_LIMIT_REQUESTS, CHAT_RATE_LIMIT_WINDOW),
    prefix,
    analytics: true,
  });

  return ratelimit;
}

/**
 * Resolve the caller IP for rate limiting. On Vercel the first value in
 * `x-forwarded-for` is the client; fall back to `x-real-ip` for other proxies.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

export interface ChatRateLimitResult {
  limited: boolean;
  response?: Response;
}

/**
 * Middleware-style IP-based rate limit guard for POST /api/chat.
 *
 * Call this before any chat business logic. When Upstash is configured, each
 * client IP gets at most {@link CHAT_RATE_LIMIT_REQUESTS} requests per hour.
 * When credentials are missing or Redis is unreachable, the check is skipped
 * so chat continues to work — we fail open rather than take the API down.
 */
export async function enforceChatRateLimit(request: Request): Promise<ChatRateLimitResult> {
  const limiter = getRateLimiter();
  if (!limiter) {
    return { limited: false };
  }

  const identifier = getClientIp(request);

  try {
    const { success } = await limiter.limit(identifier);
    if (!success) {
      return {
        limited: true,
        response: new Response(JSON.stringify(RATE_LIMIT_EXCEEDED_BODY), {
          status: 429,
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
      };
    }
  } catch (error) {
    // Redis outage must not block legitimate users — log and allow the request.
    console.warn(
      "[rate-limit] Upstash check failed — allowing request.",
      error instanceof Error ? error.message : error,
    );
  }

  return { limited: false };
}
