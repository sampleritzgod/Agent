export type ConversationMessageRole = "user" | "assistant";

export interface ConversationMessage {
  id?: string;
  role: ConversationMessageRole;
  content: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationHistory {
  summary?: string;
  messages: ConversationMessage[];
}
