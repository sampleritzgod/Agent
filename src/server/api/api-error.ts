import { PersonaManagerError } from "@/lib/personas/persona-errors";

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
  if (!isRecord(error)) {
    return false;
  }

  return error.code === "ENOENT";
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
