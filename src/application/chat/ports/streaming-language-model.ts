import type { ConversationMessageRole } from "@/domain/conversations/conversation";

export interface ChatModelMessage {
  role: ConversationMessageRole;
  content: string;
}

export type ChatToolDefinition = Record<string, unknown> & {
  type: string;
};

export type ChatToolChoice = "auto" | "none" | "required" | Record<string, unknown>;

export interface StreamModelResponseInput {
  systemPrompt: string;
  messages: ChatModelMessage[];
  model?: string;
  userId?: string;
  metadata?: Record<string, string>;
  tools?: ChatToolDefinition[];
  toolChoice?: ChatToolChoice;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface ChatModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  raw?: unknown;
}

export interface ChatModelError {
  message: string;
  code?: string;
  type?: string;
}

export type ChatStreamEvent =
  | {
      type: "response.started";
      responseId?: string;
      rawEvent?: unknown;
    }
  | {
      type: "text.delta";
      delta: string;
      rawEvent?: unknown;
    }
  | {
      type: "text.done";
      text: string;
      rawEvent?: unknown;
    }
  | {
      type: "response.completed";
      responseId?: string;
      usage?: ChatModelUsage;
      rawEvent?: unknown;
    }
  | {
      type: "response.failed";
      error: ChatModelError;
      rawEvent?: unknown;
    }
  | {
      type: "response.event";
      event: string;
      data: unknown;
    };

export interface StreamingLanguageModel {
  streamResponse(input: StreamModelResponseInput): AsyncIterable<ChatStreamEvent>;
}
