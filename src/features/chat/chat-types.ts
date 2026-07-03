import type { ConversationTurn } from "@/features/prompt-builder";

export type { ConversationTurn };

/** Incoming chat request handled by {@link ChatService}. */
export interface ChatRequest {
  persona: string;
  message: string;
  /** Recent turns, oldest first. The current `message` is sent separately. */
  conversationHistory?: ConversationTurn[];
}

export interface ChatTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Successful chat response returned by {@link ChatService}. */
export interface ChatResponse {
  message: string;
  usage: ChatTokenUsage;
  model: string;
}

export interface ChatServiceConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  organization?: string;
  project?: string;
  temperature?: number;
  maxTokens?: number;
  /** Max recent history turns passed to the prompt builder. Defaults to 10. */
  maxHistoryMessages?: number;
  /** Max transcript chunks included as creator context. Defaults to 6. */
  maxContextChunks?: number;
  fetchImpl?: typeof fetch;
}

export type ChatErrorCode =
  | "INVALID_REQUEST"
  | "PERSONA_NOT_FOUND"
  | "OPENAI_CONFIG_ERROR"
  | "OPENAI_REQUEST_FAILED"
  | "OPENAI_EMPTY_RESPONSE";

/** Personas available in the integrated chat pipeline. */
export const SUPPORTED_PERSONAS = ["hitesh", "piyush"] as const;
export type SupportedPersona = (typeof SUPPORTED_PERSONAS)[number];

export class ChatServiceError extends Error {
  constructor(
    public readonly code: ChatErrorCode,
    message: string,
    public readonly status: number = 500,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ChatServiceError";
  }
}
