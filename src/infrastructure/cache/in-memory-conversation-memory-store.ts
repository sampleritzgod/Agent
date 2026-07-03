import type {
  AppendConversationMessageInput,
  ConversationMemoryStore,
  CreateConversationSessionInput,
  GetConversationMessagesInput,
  SaveConversationSummaryInput,
} from "@/application/memory/ports/conversation-memory-store";
import type {
  ConversationMessage,
  ConversationSession,
  ConversationSummary,
} from "@/domain/conversations";

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `msg_${Date.now()}`;
}

function cloneMessage(message: ConversationMessage): ConversationMessage {
  return {
    ...message,
    metadata: message.metadata ? { ...message.metadata } : undefined,
  };
}

function cloneSummary(summary: ConversationSummary): ConversationSummary {
  return { ...summary };
}

function cloneSession(session: ConversationSession): ConversationSession {
  return {
    ...session,
    summary: session.summary ? cloneSummary(session.summary) : undefined,
    metadata: session.metadata ? { ...session.metadata } : undefined,
  };
}

export class InMemoryConversationMemoryStore implements ConversationMemoryStore {
  private readonly sessions = new Map<string, ConversationSession>();
  private readonly messages = new Map<string, ConversationMessage[]>();

  async getSession(sessionId: string): Promise<ConversationSession | undefined> {
    const session = this.sessions.get(sessionId);
    return session ? cloneSession(session) : undefined;
  }

  async createSession(
    input: CreateConversationSessionInput,
  ): Promise<ConversationSession> {
    const existing = this.sessions.get(input.sessionId);
    if (existing) {
      return cloneSession(existing);
    }

    const createdAt = input.createdAt ?? nowIso();
    const session: ConversationSession = {
      id: input.sessionId,
      createdAt,
      updatedAt: createdAt,
      metadata: input.metadata ? { ...input.metadata } : undefined,
    };

    this.sessions.set(input.sessionId, session);
    this.messages.set(input.sessionId, []);
    return cloneSession(session);
  }

  async touchSession(sessionId: string, updatedAt = nowIso()): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.sessions.set(sessionId, {
      ...session,
      updatedAt,
    });
  }

  async appendMessage(
    input: AppendConversationMessageInput,
  ): Promise<ConversationMessage> {
    const createdAt = input.createdAt ?? nowIso();
    const message: ConversationMessage = {
      id: createId(),
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      createdAt,
      metadata: input.metadata ? { ...input.metadata } : undefined,
    };

    const messages = this.messages.get(input.sessionId) ?? [];
    this.messages.set(input.sessionId, [...messages, message]);
    await this.touchSession(input.sessionId, createdAt);
    return cloneMessage(message);
  }

  async getMessages(
    input: GetConversationMessagesInput,
  ): Promise<ConversationMessage[]> {
    const messages = this.messages.get(input.sessionId) ?? [];
    const selected =
      input.limit !== undefined ? messages.slice(-Math.max(0, input.limit)) : messages;
    return selected.map(cloneMessage);
  }

  async getSummary(sessionId: string): Promise<ConversationSummary | undefined> {
    const summary = this.sessions.get(sessionId)?.summary;
    return summary ? cloneSummary(summary) : undefined;
  }

  async saveSummary(input: SaveConversationSummaryInput): Promise<void> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      await this.createSession({ sessionId: input.sessionId });
    }

    const current = this.sessions.get(input.sessionId);
    if (!current) {
      return;
    }

    this.sessions.set(input.sessionId, {
      ...current,
      updatedAt: input.summary.updatedAt,
      summary: cloneSummary(input.summary),
    });
  }
}
