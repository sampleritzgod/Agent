import { handleChatPost } from "@/features/chat";

export const runtime = "nodejs";

/**
 * POST /api/chat — persona chat endpoint.
 *
 * Rate limiting is enforced inside {@link handleChatPost} via Upstash Redis
 * (10 requests/hour/IP when UPSTASH_REDIS_REST_* env vars are set). Missing
 * credentials disable limiting automatically so local dev keeps working.
 */
export function POST(request: Request): Promise<Response> {
  return handleChatPost(request);
}
