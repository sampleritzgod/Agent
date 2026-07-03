export type ConversationMessageRole = "user" | "assistant";

export interface ConversationMessage {
  id?: string;
  sessionId?: string;
  role: ConversationMessageRole;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationSummary {
  content: string;
  summarizedMessageCount: number;
  updatedAt: string;
}

export interface ConversationSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  summary?: ConversationSummary;
  metadata?: Record<string, unknown>;
}

export interface ConversationHistory {
  sessionId?: string;
  summary?: string;
  messages: ConversationMessage[];
  estimatedTokens?: number;
  totalStoredMessages?: number;
}
