import { createChatService, getChatService } from "./chat-service";
import { enforceChatRateLimit } from "./rate-limit";
import type { ChatRequest, ChatResponse, ConversationTurn } from "./chat-types";
import { ChatServiceError } from "./chat-types";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

const MAX_MESSAGE_CHARS = 12_000;
const PERSONA_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}`;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isDevelopment(): boolean {
  const env =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env ?? {};
  return env.APP_ENV === "development" || env.NODE_ENV === "development";
}

/**
 * Log detailed diagnostics for a failed request — only in development, so raw
 * OpenAI errors and stack traces never reach production logs or the frontend.
 */
function logError(error: ChatServiceError, requestId: string): void {
  if (!isDevelopment()) {
    return;
  }
  console.error(
    `[api:${requestId}] type=${error.code} status=${error.status} openaiCode=${
      error.openaiCode ?? "n/a"
    }`,
    error.cause ?? error.message,
  );
}

function errorResponse(error: ChatServiceError, requestId: string): Response {
  logError(error, requestId);
  const body: ApiErrorBody = {
    error: { code: error.code, message: error.message, requestId },
  };
  return jsonResponse(body, error.status);
}

function parseConversationHistory(value: unknown): ConversationTurn[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ChatServiceError(
      "INVALID_REQUEST",
      "conversationHistory must be an array.",
      400,
    );
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new ChatServiceError(
        "INVALID_REQUEST",
        `conversationHistory[${index}] must be an object.`,
        400,
      );
    }
    const role = item.role;
    const content = item.content;
    if (role !== "user" && role !== "assistant") {
      throw new ChatServiceError(
        "INVALID_REQUEST",
        `conversationHistory[${index}].role must be "user" or "assistant".`,
        400,
      );
    }
    if (typeof content !== "string" || !content.trim()) {
      throw new ChatServiceError(
        "INVALID_REQUEST",
        `conversationHistory[${index}].content must be a non-empty string.`,
        400,
      );
    }
    return { role, content: content.trim() };
  });
}

/** Parse and validate the POST /api/chat JSON body. */
export async function parseChatRequest(request: Request): Promise<ChatRequest> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    throw new ChatServiceError(
      "INVALID_REQUEST",
      "Content-Type must be application/json.",
      415,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ChatServiceError("INVALID_REQUEST", "Request body must be valid JSON.", 400);
  }

  if (!isRecord(body)) {
    throw new ChatServiceError("INVALID_REQUEST", "Request body must be a JSON object.", 400);
  }

  const personaRaw = body.persona ?? body.personaId;
  if (typeof personaRaw !== "string" || !personaRaw.trim()) {
    throw new ChatServiceError("INVALID_REQUEST", "persona is required.", 400);
  }
  const persona = personaRaw.trim();
  if (!PERSONA_PATTERN.test(persona)) {
    throw new ChatServiceError("INVALID_REQUEST", "persona has an invalid format.", 400);
  }

  if (typeof body.message !== "string" || !body.message.trim()) {
    throw new ChatServiceError("INVALID_REQUEST", "message is required.", 400);
  }
  const message = body.message.trim();
  if (message.length > MAX_MESSAGE_CHARS) {
    throw new ChatServiceError("INVALID_REQUEST", "message is too long.", 400);
  }

  return {
    persona,
    message,
    conversationHistory: parseConversationHistory(body.conversationHistory),
  };
}

function normalizeError(error: unknown, requestId: string): Response {
  if (error instanceof ChatServiceError) {
    return errorResponse(error, requestId);
  }
  return errorResponse(
    new ChatServiceError(
      "OPENAI_REQUEST_FAILED",
      "Something went wrong while generating the response.",
      500,
      error,
    ),
    requestId,
  );
}

/**
 * Thin HTTP adapter for POST /api/chat. Parses the request, delegates to
 * {@link ChatService}, and returns JSON — no business logic here.
 *
 * Rate limiting runs first via {@link enforceChatRateLimit} so abusive traffic
 * is rejected before OpenAI is called.
 */
export async function handleChatPost(request: Request): Promise<Response> {
  const requestId = createRequestId();

  // IP-based rate limit — returns 429 before any chat processing when exceeded.
  const rateLimit = await enforceChatRateLimit(request);
  if (rateLimit.limited && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const chatRequest = await parseChatRequest(request);
    const service = getChatService();
    const result: ChatResponse = await service.chat(chatRequest, request.signal);
    return jsonResponse(result, 200);
  } catch (error) {
    return normalizeError(error, requestId);
  }
}

export { createChatService, getChatService };
