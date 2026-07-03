import { buildPrompt } from "@/features/prompt-builder";
import { loadPersona } from "@/features/prompt-builder/load-persona";

import type {
  ChatRequest,
  ChatResponse,
  ChatServiceConfig,
  ChatTokenUsage,
} from "./chat-types";
import { ChatServiceError, SUPPORTED_PERSONAS } from "./chat-types";

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_MAX_HISTORY = 10;
const DEFAULT_MAX_CONTEXT_CHUNKS = 6;
const DEFAULT_TIMEOUT_MS = 60_000;

type EnvSource = Record<string, string | undefined>;

function readEnv(): EnvSource {
  const runtime = globalThis as { process?: { env?: EnvSource } };
  return runtime.process?.env ?? {};
}

function optionalEnv(env: EnvSource, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function readFloat(env: EnvSource, key: string, fallback: number): number {
  const value = Number.parseFloat(env[key] ?? "");
  return Number.isFinite(value) ? value : fallback;
}

function readPositiveInt(env: EnvSource, key: string, fallback: number): number {
  const value = Number.parseInt(env[key] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isDevelopment(): boolean {
  const env = readEnv();
  return env.APP_ENV === "development" || env.NODE_ENV === "development";
}

function devLog(message: string): void {
  if (isDevelopment()) {
    console.log(`[chat] ${message}`);
  }
}

interface ChatCompletionApiResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Non-streaming chat service: validates the request, builds the persona prompt,
 * calls the OpenAI Chat Completions API, and returns the assistant message.
 *
 * Independent of HTTP — the API route should only parse the request, call
 * {@link ChatService.chat}, and serialize the response.
 */
export class ChatService {
  private readonly config: ChatServiceConfig;

  constructor(config: ChatServiceConfig) {
    if (!config.apiKey?.trim()) {
      throw new ChatServiceError(
        "OPENAI_CONFIG_ERROR",
        "The AI service is not configured.",
        500,
      );
    }
    if (!config.model?.trim()) {
      throw new ChatServiceError(
        "OPENAI_CONFIG_ERROR",
        "OpenAI chat model is not configured.",
        500,
      );
    }
    this.config = config;
  }

  /**
   * Run one chat turn: persona prompt → OpenAI → assistant reply.
   */
  async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const persona = request.persona?.trim();
    if (!persona) {
      throw new ChatServiceError("INVALID_REQUEST", "persona is required.", 400);
    }

    const message = request.message?.trim();
    if (!message) {
      throw new ChatServiceError("INVALID_REQUEST", "message is required.", 400);
    }

    devLog(`persona=${persona} messageChars=${message.length} historyTurns=${request.conversationHistory?.length ?? 0}`);

    this.assertSupportedPersona(persona);
    await this.assertPersonaExists(persona);

    const { messages, usedChunks } = await buildPrompt({
      persona,
      userMessage: message,
      conversationHistory: request.conversationHistory ?? [],
      maxHistoryMessages: this.config.maxHistoryMessages ?? DEFAULT_MAX_HISTORY,
      maxContextChunks: this.config.maxContextChunks ?? DEFAULT_MAX_CONTEXT_CHUNKS,
    });

    devLog(
      `prompt built: ${messages.length} messages, ${usedChunks.length} context chunk(s)`,
    );

    const completion = await this.callOpenAI(messages, signal);

    devLog(
      `response model=${completion.model} tokens=${completion.usage.totalTokens}`,
    );

    return completion;
  }

  /** Restrict chat to the integrated persona set (Hitesh / Piyush). */
  private assertSupportedPersona(persona: string): void {
    if (!(SUPPORTED_PERSONAS as readonly string[]).includes(persona)) {
      throw new ChatServiceError(
        "PERSONA_NOT_FOUND",
        `Persona "${persona}" is not supported. Choose one of: ${SUPPORTED_PERSONAS.join(", ")}.`,
        404,
      );
    }
  }

  /** Ensure the persona markdown definition exists before building a prompt. */
  private async assertPersonaExists(persona: string): Promise<void> {
    try {
      await loadPersona(persona);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail.includes("not found") || detail.includes("Persona definition")) {
        throw new ChatServiceError(
          "PERSONA_NOT_FOUND",
          `Persona "${persona}" was not found.`,
          404,
          error,
        );
      }
      throw error;
    }
  }

  private async callOpenAI(
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    const baseUrl = (this.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const fetchImpl = this.config.fetchImpl ?? fetch;

    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${this.config.apiKey}`,
    };
    if (this.config.organization) {
      headers["openai-organization"] = this.config.organization;
    }
    if (this.config.project) {
      headers["openai-project"] = this.config.project;
    }

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: this.config.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: this.config.maxTokens ?? DEFAULT_MAX_TOKENS,
    };

    devLog(`openai request started model=${this.config.model}`);

    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onExternalAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener("abort", onExternalAbort);
      }
    }

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) {
        devLog(`openai request timed out after ${timeoutMs}ms`);
        throw new ChatServiceError(
          "OPENAI_TIMEOUT",
          "The AI took too long to respond. Please try again.",
          504,
          error,
        );
      }
      devLog("openai request failed to connect");
      throw new ChatServiceError(
        "OPENAI_NETWORK_ERROR",
        "Unable to connect to the AI service. Please try again.",
        502,
        error,
      );
    } finally {
      clearTimeout(timer);
      if (signal) {
        signal.removeEventListener("abort", onExternalAbort);
      }
    }

    if (!response.ok) {
      const { code, type, raw } = await this.readOpenAIError(response);
      devLog(
        `openai error status=${response.status} code=${code ?? type ?? "n/a"}`,
      );
      throw this.mapHttpError(response.status, code, type, raw);
    }

    const payload = (await response.json().catch(() => null)) as
      | ChatCompletionApiResponse
      | null;
    const content = payload?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new ChatServiceError(
        "OPENAI_EMPTY_RESPONSE",
        "The AI returned an empty response. Please try again.",
        502,
      );
    }

    const usage: ChatTokenUsage = {
      promptTokens: payload?.usage?.prompt_tokens ?? 0,
      completionTokens: payload?.usage?.completion_tokens ?? 0,
      totalTokens: payload?.usage?.total_tokens ?? 0,
    };

    return {
      message: content,
      usage,
      model: payload?.model ?? this.config.model,
    };
  }

  /** Read and parse an OpenAI error body without exposing it to callers. */
  private async readOpenAIError(
    response: Response,
  ): Promise<{ code?: string; type?: string; raw: string }> {
    const raw = await response.text().catch(() => "");
    if (!raw) {
      return { raw: "" };
    }
    try {
      const parsed = JSON.parse(raw) as {
        error?: { code?: string; type?: string; message?: string };
      };
      return {
        ...(parsed.error?.code ? { code: parsed.error.code } : {}),
        ...(parsed.error?.type ? { type: parsed.error.type } : {}),
        raw,
      };
    } catch {
      return { raw };
    }
  }

  /**
   * Map an OpenAI non-2xx response to a user-friendly {@link ChatServiceError}.
   * The raw OpenAI body is stored only as `cause`/`openaiCode` for development
   * logging — it is never surfaced in the user-facing message.
   */
  private mapHttpError(
    status: number,
    code: string | undefined,
    type: string | undefined,
    raw: string,
  ): ChatServiceError {
    const oaiCode = code ?? type;

    if (status === 401 || status === 403) {
      return new ChatServiceError(
        "OPENAI_INVALID_API_KEY",
        "The AI service is not configured correctly.",
        500,
        raw,
        oaiCode,
      );
    }

    if (code === "model_not_found" || (status === 404 && !oaiCode) || status === 404) {
      return new ChatServiceError(
        "OPENAI_MODEL_ERROR",
        "The AI model is currently unavailable. Please try again later.",
        502,
        raw,
        oaiCode,
      );
    }

    if (status === 429) {
      if (code === "insufficient_quota" || type === "insufficient_quota") {
        return new ChatServiceError(
          "OPENAI_QUOTA_EXCEEDED",
          "The AI service has reached its usage limit. Please try again later.",
          503,
          raw,
          oaiCode,
        );
      }
      return new ChatServiceError(
        "OPENAI_RATE_LIMITED",
        "The AI service is currently busy. Please wait a few seconds and try again.",
        429,
        raw,
        oaiCode,
      );
    }

    if (status >= 500) {
      return new ChatServiceError(
        "OPENAI_REQUEST_FAILED",
        "The AI service is temporarily unavailable. Please try again.",
        502,
        raw,
        oaiCode,
      );
    }

    return new ChatServiceError(
      "OPENAI_REQUEST_FAILED",
      "Something went wrong while generating the response.",
      502,
      raw,
      oaiCode,
    );
  }
}

/** Build a {@link ChatService} from environment variables (`.env`). */
export function createChatService(config: Partial<ChatServiceConfig> = {}): ChatService {
  const env = readEnv();
  const apiKey = config.apiKey ?? optionalEnv(env, "OPENAI_API_KEY");
  if (!apiKey) {
    throw new ChatServiceError(
      "OPENAI_CONFIG_ERROR",
      "The AI service is not configured.",
      500,
    );
  }

  const model =
    config.model ??
    optionalEnv(env, "OPENAI_CHAT_MODEL") ??
    optionalEnv(env, "OPENAI_RESPONSES_MODEL") ??
    DEFAULT_MODEL;

  return new ChatService({
    apiKey,
    model,
    baseUrl: config.baseUrl ?? optionalEnv(env, "OPENAI_API_BASE_URL"),
    organization: config.organization ?? optionalEnv(env, "OPENAI_ORGANIZATION"),
    project: config.project ?? optionalEnv(env, "OPENAI_PROJECT"),
    temperature:
      config.temperature ??
      readFloat(env, "OPENAI_CHAT_TEMPERATURE", DEFAULT_TEMPERATURE),
    maxTokens:
      config.maxTokens ??
      readPositiveInt(env, "OPENAI_CHAT_MAX_TOKENS", DEFAULT_MAX_TOKENS),
    maxHistoryMessages:
      config.maxHistoryMessages ??
      readPositiveInt(env, "OPENAI_CHAT_MAX_HISTORY", DEFAULT_MAX_HISTORY),
    maxContextChunks:
      config.maxContextChunks ??
      readPositiveInt(env, "OPENAI_CHAT_MAX_CONTEXT_CHUNKS", DEFAULT_MAX_CONTEXT_CHUNKS),
    timeoutMs:
      config.timeoutMs ??
      readPositiveInt(env, "OPENAI_CHAT_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    fetchImpl: config.fetchImpl ?? fetch,
  });
}

/** Singleton for the API route — created once per process. */
let defaultService: ChatService | undefined;

export function getChatService(): ChatService {
  if (!defaultService) {
    defaultService = createChatService();
  }
  return defaultService;
}
