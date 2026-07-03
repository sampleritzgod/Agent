import type {
  ConversationMessage,
  ConversationSession,
  ConversationSummary,
} from "./conversation";
import type {
  AppendConversationMessageInput,
  ConversationMemoryStore,
  CreateConversationSessionInput,
  GetConversationMessagesInput,
  SaveConversationSummaryInput,
} from "./conversation-memory";

export interface RedisConversationMemoryClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  rpush(key: string, value: string): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  expire?(key: string, seconds: number): Promise<unknown>;
}

export interface RedisConversationMemoryStoreOptions {
  client: RedisConversationMemoryClient;
  keyPrefix?: string;
  ttlSeconds?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `msg_${Date.now()}`;
}

function parseJson<T>(raw: string | null): T | undefined {
  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw) as T;
}

/** Production conversation store backed by Redis (opt-in alternative to in-memory). */
export class RedisConversationMemoryStore implements ConversationMemoryStore {
  private readonly keyPrefix: string;

  constructor(private readonly options: RedisConversationMemoryStoreOptions) {
    this.keyPrefix = options.keyPrefix ?? "conversation-memory";
  }

  async getSession(sessionId: string): Promise<ConversationSession | undefined> {
    return parseJson<ConversationSession>(
      await this.options.client.get(this.sessionKey(sessionId)),
    );
  }

  async createSession(
    input: CreateConversationSessionInput,
  ): Promise<ConversationSession> {
    const existing = await this.getSession(input.sessionId);
    if (existing) {
      return existing;
    }

    const createdAt = input.createdAt ?? nowIso();
    const session: ConversationSession = {
      id: input.sessionId,
      createdAt,
      updatedAt: createdAt,
      metadata: input.metadata,
    };

    await this.saveSession(session);
    return session;
  }

  async touchSession(sessionId: string, updatedAt = nowIso()): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return;
    }

    await this.saveSession({
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
      metadata: input.metadata,
    };

    await this.options.client.rpush(
      this.messagesKey(input.sessionId),
      JSON.stringify(message),
    );
    await this.touchSession(input.sessionId, createdAt);
    await this.expireSessionKeys(input.sessionId);
    return message;
  }

  async getMessages(
    input: GetConversationMessagesInput,
  ): Promise<ConversationMessage[]> {
    if (input.limit !== undefined && input.limit <= 0) {
      return [];
    }

    const start = input.limit !== undefined ? -Math.max(0, input.limit) : 0;
    const rawMessages = await this.options.client.lrange(
      this.messagesKey(input.sessionId),
      start,
      -1,
    );

    return rawMessages.map((raw) => JSON.parse(raw) as ConversationMessage);
  }

  async getSummary(sessionId: string): Promise<ConversationSummary | undefined> {
    const session = await this.getSession(sessionId);
    return session?.summary;
  }

  async saveSummary(input: SaveConversationSummaryInput): Promise<void> {
    const session =
      (await this.getSession(input.sessionId)) ??
      (await this.createSession({ sessionId: input.sessionId }));

    await this.saveSession({
      ...session,
      updatedAt: input.summary.updatedAt,
      summary: input.summary,
    });
  }

  private async saveSession(session: ConversationSession): Promise<void> {
    await this.options.client.set(this.sessionKey(session.id), JSON.stringify(session));
    await this.expireSessionKeys(session.id);
  }

  private async expireSessionKeys(sessionId: string): Promise<void> {
    if (!this.options.ttlSeconds || !this.options.client.expire) {
      return;
    }

    await Promise.all([
      this.options.client.expire(this.sessionKey(sessionId), this.options.ttlSeconds),
      this.options.client.expire(this.messagesKey(sessionId), this.options.ttlSeconds),
    ]);
  }

  private sessionKey(sessionId: string): string {
    return `${this.keyPrefix}:session:${sessionId}`;
  }

  private messagesKey(sessionId: string): string {
    return `${this.keyPrefix}:messages:${sessionId}`;
  }
}
