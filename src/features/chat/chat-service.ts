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
        "OPENAI_API_KEY is not set.",
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

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      throw new ChatServiceError(
        "OPENAI_REQUEST_FAILED",
        "Failed to reach the OpenAI API.",
        502,
        error,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      devLog(`openai request failed status=${response.status}`);
      throw new ChatServiceError(
        "OPENAI_REQUEST_FAILED",
        `OpenAI request failed (${response.status}): ${detail}`,
        response.status >= 500 ? 502 : 400,
      );
    }

    const payload = (await response.json()) as ChatCompletionApiResponse;
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new ChatServiceError(
        "OPENAI_EMPTY_RESPONSE",
        "OpenAI returned an empty assistant message.",
        502,
      );
    }

    const usage: ChatTokenUsage = {
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
      totalTokens: payload.usage?.total_tokens ?? 0,
    };

    return {
      message: content,
      usage,
      model: payload.model ?? this.config.model,
    };
  }
}

/** Build a {@link ChatService} from environment variables (`.env`). */
export function createChatService(config: Partial<ChatServiceConfig> = {}): ChatService {
  const env = readEnv();
  const apiKey = config.apiKey ?? optionalEnv(env, "OPENAI_API_KEY");
  if (!apiKey) {
    throw new ChatServiceError(
      "OPENAI_CONFIG_ERROR",
      "OPENAI_API_KEY is not set.",
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
