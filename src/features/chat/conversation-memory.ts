import type {
  ConversationHistory,
  ConversationMessage,
  ConversationMessageRole,
  ConversationSession,
  ConversationSummary,
} from "./conversation";

// --- Store contract (implemented by the in-memory and Redis stores) ---------

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

// --- Summarizer -------------------------------------------------------------

export interface SummarizeConversationInput {
  previousSummary?: string;
  messages: ConversationMessage[];
  maxSummaryChars?: number;
  signal?: AbortSignal;
}

export interface ConversationSummarizer {
  summarize(input: SummarizeConversationInput): Promise<string>;
}

const DEFAULT_MAX_SUMMARY_CHARS = 2_000;

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxChars - 14)).trimEnd()}\n[truncated]`;
}

export class ExtractiveConversationSummarizer implements ConversationSummarizer {
  async summarize(input: SummarizeConversationInput): Promise<string> {
    const maxSummaryChars = input.maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS;
    const lines = input.messages.map((message) => {
      const timestamp = message.createdAt ? ` at ${message.createdAt}` : "";
      return `- ${message.role}${timestamp}: ${message.content}`;
    });

    const summary = [
      input.previousSummary
        ? `Previous summary:\n${input.previousSummary.trim()}`
        : "",
      lines.length > 0 ? `Earlier conversation:\n${lines.join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return truncate(summary || "No previous conversation context.", maxSummaryChars);
  }
}

// --- Memory manager ---------------------------------------------------------

export interface ConversationMemoryLimits {
  maxRecentMessages: number;
  maxContextTokens: number;
  maxSummaryChars: number;
}

export interface ConversationMemoryManagerOptions {
  store: ConversationMemoryStore;
  summarizer: ConversationSummarizer;
  limits?: Partial<ConversationMemoryLimits>;
}

export interface LoadConversationMemoryInput {
  sessionId: string;
  maxRecentMessages?: number;
  maxContextTokens?: number;
  signal?: AbortSignal;
}

export interface CreateConversationMemorySessionInput {
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface GetRecentConversationMessagesInput {
  sessionId: string;
  limit?: number;
}

export interface SummarizeConversationMemoryInput {
  sessionId: string;
  maxSummaryChars?: number;
  signal?: AbortSignal;
}

export interface ConversationMemory {
  createSession(input?: CreateConversationMemorySessionInput): Promise<ConversationSession>;
  ensureSession(sessionId: string): Promise<void>;
  appendMessage(input: AppendConversationMessageInput): Promise<ConversationMessage>;
  getRecentMessages(
    input: GetRecentConversationMessagesInput,
  ): Promise<ConversationMessage[]>;
  summarizeConversation(input: SummarizeConversationMemoryInput): Promise<string>;
  loadHistory(input: LoadConversationMemoryInput): Promise<ConversationHistory>;
}

const DEFAULT_LIMITS: ConversationMemoryLimits = {
  maxRecentMessages: 16,
  maxContextTokens: 3_000,
  maxSummaryChars: 2_000,
};

function nowIso(): string {
  return new Date().toISOString();
}

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `session_${Date.now()}`;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateMessageTokens(message: ConversationMessage): number {
  return estimateTokens(`${message.role}: ${message.content}`);
}

function estimateHistoryTokens(summary: string | undefined, messages: ConversationMessage[]): number {
  const summaryTokens = summary ? estimateTokens(`summary: ${summary}`) : 0;
  return messages.reduce(
    (total, message) => total + estimateMessageTokens(message),
    summaryTokens,
  );
}

function selectRecentMessages(
  messages: ConversationMessage[],
  summary: string | undefined,
  limits: ConversationMemoryLimits,
): ConversationMessage[] {
  const maxRecentMessages = Math.max(1, limits.maxRecentMessages);
  const maxContextTokens = Math.max(1, limits.maxContextTokens);
  const summaryTokens = summary ? estimateTokens(`summary: ${summary}`) : 0;
  let remainingTokens = Math.max(1, maxContextTokens - summaryTokens);
  const selected: ConversationMessage[] = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (selected.length >= maxRecentMessages) {
      break;
    }

    const message = messages[index];
    const messageTokens = estimateMessageTokens(message);
    if (selected.length > 0 && messageTokens > remainingTokens) {
      break;
    }

    selected.unshift(message);
    remainingTokens -= messageTokens;
  }

  if (selected.length === 0 && messages.length > 0) {
    selected.push(messages[messages.length - 1]);
  }

  return selected;
}

export class ConversationMemoryManager implements ConversationMemory {
  private readonly store: ConversationMemoryStore;
  private readonly summarizer: ConversationSummarizer;
  private readonly limits: ConversationMemoryLimits;

  constructor(options: ConversationMemoryManagerOptions) {
    this.store = options.store;
    this.summarizer = options.summarizer;
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
  }

  async createSession(
    input: CreateConversationMemorySessionInput = {},
  ): Promise<ConversationSession> {
    return this.store.createSession({
      sessionId: input.sessionId ?? createSessionId(),
      createdAt: nowIso(),
      metadata: input.metadata,
    });
  }

  async ensureSession(sessionId: string): Promise<void> {
    const existing = await this.store.getSession(sessionId);
    if (existing) {
      return;
    }

    await this.createSession({ sessionId });
  }

  async appendMessage(
    input: AppendConversationMessageInput,
  ): Promise<ConversationMessage> {
    await this.ensureSession(input.sessionId);
    const message = await this.store.appendMessage({
      ...input,
      content: input.content.trim(),
      createdAt: input.createdAt ?? nowIso(),
    });
    await this.store.touchSession(input.sessionId, message.createdAt);
    return message;
  }

  async getRecentMessages(
    input: GetRecentConversationMessagesInput,
  ): Promise<ConversationMessage[]> {
    await this.ensureSession(input.sessionId);
    return this.store.getMessages({
      sessionId: input.sessionId,
      limit: input.limit ?? this.limits.maxRecentMessages,
    });
  }

  async summarizeConversation(
    input: SummarizeConversationMemoryInput,
  ): Promise<string> {
    await this.ensureSession(input.sessionId);
    const [messages, storedSummary] = await Promise.all([
      this.store.getMessages({ sessionId: input.sessionId }),
      this.store.getSummary(input.sessionId),
    ]);
    const summarizedMessageCount = storedSummary?.summarizedMessageCount ?? 0;
    const messagesToSummarize = messages.slice(summarizedMessageCount);

    if (messagesToSummarize.length === 0 && storedSummary?.content) {
      return storedSummary.content;
    }

    const content = await this.summarizer.summarize({
      previousSummary: storedSummary?.content,
      messages: messagesToSummarize,
      maxSummaryChars: input.maxSummaryChars ?? this.limits.maxSummaryChars,
      signal: input.signal,
    });

    await this.store.saveSummary({
      sessionId: input.sessionId,
      summary: {
        content,
        summarizedMessageCount: messages.length,
        updatedAt: nowIso(),
      },
    });

    return content;
  }

  async loadHistory(input: LoadConversationMemoryInput): Promise<ConversationHistory> {
    await this.ensureSession(input.sessionId);

    const limits: ConversationMemoryLimits = {
      ...this.limits,
      ...(input.maxRecentMessages !== undefined
        ? { maxRecentMessages: input.maxRecentMessages }
        : {}),
      ...(input.maxContextTokens !== undefined
        ? { maxContextTokens: input.maxContextTokens }
        : {}),
    };

    const [messages, storedSummary] = await Promise.all([
      this.store.getMessages({ sessionId: input.sessionId }),
      this.store.getSummary(input.sessionId),
    ]);

    let summary = storedSummary;
    let unsummarizedMessages = messages.slice(summary?.summarizedMessageCount ?? 0);
    let selectedMessages = selectRecentMessages(
      unsummarizedMessages,
      summary?.content,
      limits,
    );
    const droppedCount = unsummarizedMessages.length - selectedMessages.length;

    if (droppedCount > 0) {
      const messagesToSummarize = unsummarizedMessages.slice(0, droppedCount);
      const summaryContent = await this.summarizer.summarize({
        previousSummary: summary?.content,
        messages: messagesToSummarize,
        maxSummaryChars: limits.maxSummaryChars,
        signal: input.signal,
      });
      summary = {
        content: summaryContent,
        summarizedMessageCount:
          (summary?.summarizedMessageCount ?? 0) + messagesToSummarize.length,
        updatedAt: nowIso(),
      };
      await this.store.saveSummary({
        sessionId: input.sessionId,
        summary,
      });

      unsummarizedMessages = messages.slice(summary.summarizedMessageCount);
      selectedMessages = selectRecentMessages(
        unsummarizedMessages,
        summary.content,
        limits,
      );
    }

    return {
      sessionId: input.sessionId,
      summary: summary?.content,
      messages: selectedMessages,
      estimatedTokens: estimateHistoryTokens(summary?.content, selectedMessages),
      totalStoredMessages: messages.length,
    };
  }
}

// --- Default in-memory store ------------------------------------------------

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
