import type { ConversationHistory } from "@/domain/conversations/conversation";

export interface LoadConversationHistoryInput {
  conversationId: string;
  personaId: string;
  userId?: string;
  signal?: AbortSignal;
}

export interface ConversationHistoryStore {
  loadHistory(input: LoadConversationHistoryInput): Promise<ConversationHistory>;
}
