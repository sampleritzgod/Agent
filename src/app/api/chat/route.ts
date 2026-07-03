import { handleChatPost } from "@/server/api/chat/chat-route-handler";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleChatPost(request);
}
