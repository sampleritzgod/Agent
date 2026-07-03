import type {
  ConversationMessage,
  ConversationMessageRole,
  ConversationSession,
  ConversationSummary,
} from "@/domain/conversations";

export interface CreateConversationSessionInput {
  sessionId: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AppendConversationMessageInput {
  sessionId: string;
  role: ConversationMessageRole;
  content: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface GetConversationMessagesInput {
  sessionId: string;
  limit?: number;
}

export interface SaveConversationSummaryInput {
  sessionId: string;
  summary: ConversationSummary;
}

export interface ConversationMemoryStore {
  getSession(sessionId: string): Promise<ConversationSession | undefined>;
  createSession(input: CreateConversationSessionInput): Promise<ConversationSession>;
  touchSession(sessionId: string, updatedAt?: string): Promise<void>;
  appendMessage(input: AppendConversationMessageInput): Promise<ConversationMessage>;
  getMessages(input: GetConversationMessagesInput): Promise<ConversationMessage[]>;
  getSummary(sessionId: string): Promise<ConversationSummary | undefined>;
  saveSummary(input: SaveConversationSummaryInput): Promise<void>;
}
