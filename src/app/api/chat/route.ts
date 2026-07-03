import { handleChatPost } from "@/features/chat";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleChatPost(request);
}
