import { ApiError } from "@/server/api/api-error";

export interface ChatPostRequest {
  personaId: string;
  message: string;
  conversationId?: string;
  transcriptLimit?: number;
}

const MAX_MESSAGE_CHARS = 12_000;
const PERSONA_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const CONVERSATION_ID_PATTERN = /^[a-zA-Z0-9_:-]{1,120}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
