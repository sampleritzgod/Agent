import { createApiErrorResponse } from "@/server/api/api-error";

import { parseChatPostRequest } from "./chat-request";
import { createChatOrchestrator } from "./chat-services";
import { createChatStreamResponse } from "./chat-stream";

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}`;
}

function createConversationId(personaId: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `conv_${personaId}_${Date.now()}`;
}

export async function handleChatPost(request: Request): Promise<Response> {
  const requestId = createRequestId();

  try {
    const parsed = await parseChatPostRequest(request);
    const conversationId = parsed.conversationId ?? createConversationId(parsed.personaId);
    const orchestrator = createChatOrchestrator();
    const result = await orchestrator.handle({
      conversationId,
      personaId: parsed.personaId,
      userMessage: parsed.message,
      transcriptLimit: parsed.transcriptLimit,
      metadata: {
        requestId,
        endpoint: "POST /api/chat",
      },
      signal: request.signal,
    });

    return createChatStreamResponse({
      requestId,
      conversationId: result.conversationId,
      personaId: result.personaId,
      stream: result.stream,
    });
  } catch (error) {
    return createApiErrorResponse(error, requestId);
  }
}
