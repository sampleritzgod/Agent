import { PersonaManagerError } from "@/features/personas";

import { createChatOrchestrator } from "./chat-service";
import { createChatStreamResponse } from "./chat-stream";

// --- Errors -----------------------------------------------------------------

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof PersonaManagerError) {
    if (error.code === "PERSONA_NOT_FOUND") {
      return new ApiError(404, "PERSONA_NOT_FOUND", "Persona not found.");
    }

    return new ApiError(
      500,
      error.code,
      "Persona configuration is invalid on the server.",
      error.details,
    );
  }

  if (isNotFoundError(error)) {
    return new ApiError(404, "PERSONA_NOT_FOUND", "Persona not found.");
  }

  if (error instanceof Error && error.message.includes("is disabled")) {
    return new ApiError(404, "PERSONA_NOT_FOUND", "Persona not found.");
  }

  if (error instanceof Error && error.message.includes("OPENAI_API_KEY")) {
    return new ApiError(
      500,
      "OPENAI_CONFIG_ERROR",
      "OpenAI is not configured on the server.",
    );
  }

  return new ApiError(
    500,
    "INTERNAL_SERVER_ERROR",
    "The chat request could not be completed.",
  );
}

export function createJsonResponse(body: unknown, init: ResponseInit): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function createApiErrorResponse(error: unknown, requestId: string): Response {
  const normalized = normalizeError(error);
  const body: ApiErrorBody = {
    error: {
      code: normalized.code,
      message: normalized.message,
      requestId,
      ...(normalized.details !== undefined ? { details: normalized.details } : {}),
    },
  };

  if (normalized.status >= 500) {
    console.error(`[api:${requestId}]`, error);
  }

  return createJsonResponse(body, { status: normalized.status });
}

// --- Request parsing --------------------------------------------------------

export interface ChatPostRequest {
  personaId: string;
  message: string;
  conversationId?: string;
  transcriptLimit?: number;
}

const MAX_MESSAGE_CHARS = 12_000;
const PERSONA_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const CONVERSATION_ID_PATTERN = /^[a-zA-Z0-9_:-]{1,120}$/;

function requireString(
  value: unknown,
  field: string,
  options: { maxLength?: number; pattern?: RegExp } = {},
): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_REQUEST", `"${field}" must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new ApiError(400, "INVALID_REQUEST", `"${field}" is required.`);
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new ApiError(400, "INVALID_REQUEST", `"${field}" is too long.`, {
      maxLength: options.maxLength,
    });
  }

  if (options.pattern && !options.pattern.test(trimmed)) {
    throw new ApiError(400, "INVALID_REQUEST", `"${field}" has an invalid format.`);
  }

  return trimmed;
}

function optionalConversationId(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireString(value, "conversationId", {
    pattern: CONVERSATION_ID_PATTERN,
  });
}

function optionalTranscriptLimit(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 20
  ) {
    throw new ApiError(400, "INVALID_REQUEST", '"transcriptLimit" must be an integer from 0 to 20.');
  }

  return value;
}

export async function parseChatPostRequest(request: Request): Promise<ChatPostRequest> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  if (!isRecord(body)) {
    throw new ApiError(400, "INVALID_REQUEST", "Request body must be a JSON object.");
  }

  return {
    personaId: requireString(body.personaId, "personaId", {
      pattern: PERSONA_ID_PATTERN,
    }),
    message: requireString(body.message, "message", {
      maxLength: MAX_MESSAGE_CHARS,
    }),
    conversationId: optionalConversationId(body.conversationId),
    transcriptLimit: optionalTranscriptLimit(body.transcriptLimit),
  };
}

// --- Route handler ----------------------------------------------------------

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
