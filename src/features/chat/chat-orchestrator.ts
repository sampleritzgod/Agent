import type {
  PersonaConfig,
  RetrievedTranscriptChunk,
} from "@/features/personas/persona-config";

import type { ConversationHistory, ConversationMessage } from "./conversation";
import type { ConversationMemory } from "./conversation-memory";
import type {
  ChatModelMessage,
  ChatStreamEvent,
  ChatToolChoice,
  ChatToolDefinition,
  StreamingLanguageModel,
} from "./chat-model";
import type { TranscriptRetriever } from "./transcript-retriever";
import { buildFinalSystemPrompt } from "./prompt-builder";

/** Persona source for chat. Satisfied by `PersonaManager`. */
export interface PersonaProvider {
  getPersonaById(personaId: string): Promise<PersonaConfig>;
}

export interface ChatOrchestratorDependencies {
  personas: PersonaProvider;
  memory: ConversationMemory;
  transcripts: TranscriptRetriever;
  languageModel: StreamingLanguageModel;
}

export interface ChatOrchestratorRequest {
  conversationId: string;
  personaId: string;
  userMessage: string;
  userId?: string;
  transcriptLimit?: number;
  maxRecentMessages?: number;
  maxContextTokens?: number;
  tools?: ChatToolDefinition[];
  toolChoice?: ChatToolChoice;
  metadata?: Record<string, string>;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface ChatOrchestratorResult {
  conversationId: string;
  personaId: string;
  stream: AsyncIterable<ChatStreamEvent>;
  retrievedTranscriptChunks: RetrievedTranscriptChunk[];
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Chat Orchestrator requires a non-empty ${field}.`);
  }

  return trimmed;
}

function normalizeHistory(history: ConversationHistory): ConversationHistory {
  return {
    summary: history.summary?.trim() || undefined,
    messages: history.messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        ...message,
        content: message.content.trim(),
      }))
      .filter((message) => message.content.length > 0),
  };
}

function assertPersonaEnabled(persona: PersonaConfig): void {
  if (!persona.enabled) {
    throw new Error(`Persona "${persona.id}" is disabled and cannot handle chat.`);
  }
}

function buildModelMessages(
  historyMessages: ConversationMessage[],
  userMessage: string,
): ChatModelMessage[] {
  return [
    ...historyMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: "user" as const,
      content: userMessage,
    },
  ];
}

/**
 * Coordinates a single chat turn: load persona + memory, retrieve transcript
 * context, build the system prompt, stream the model response, and persist the
 * assistant reply. Dependencies are injected so each part stays swappable.
 */
export class ChatOrchestrator {
  constructor(private readonly dependencies: ChatOrchestratorDependencies) {}

  async handle(request: ChatOrchestratorRequest): Promise<ChatOrchestratorResult> {
    const conversationId = requireNonEmpty(request.conversationId, "conversationId");
    const personaId = requireNonEmpty(request.personaId, "personaId");
    const userMessage = requireNonEmpty(request.userMessage, "userMessage");
    const userId = request.userId?.trim() || undefined;

    const persona = await this.dependencies.personas.getPersonaById(personaId);
    assertPersonaEnabled(persona);

    const history = normalizeHistory(
      await this.dependencies.memory.loadHistory({
        sessionId: conversationId,
        ...(request.maxRecentMessages !== undefined
          ? { maxRecentMessages: request.maxRecentMessages }
          : {}),
        ...(request.maxContextTokens !== undefined
          ? { maxContextTokens: request.maxContextTokens }
          : {}),
        signal: request.signal,
      }),
    );

    await this.dependencies.memory.appendMessage({
      sessionId: conversationId,
      role: "user",
      content: userMessage,
      metadata: {
        personaId,
        ...(userId ? { userId } : {}),
      },
    });

    const retrievedTranscriptChunks = await this.dependencies.transcripts.retrieve({
      conversationId,
      personaId,
      persona,
      userMessage,
      history: history.messages,
      ...(request.transcriptLimit !== undefined
        ? { limit: request.transcriptLimit }
        : {}),
      signal: request.signal,
    });

    const systemPrompt = buildFinalSystemPrompt({
      persona,
      retrievedTranscriptChunks,
      previousConversationSummary: history.summary,
      currentUserMessage: userMessage,
    });

    const modelStream = this.dependencies.languageModel.streamResponse({
      systemPrompt,
      messages: buildModelMessages(history.messages, userMessage),
      ...(request.model ? { model: request.model } : {}),
      ...(userId ? { userId } : {}),
      ...(request.metadata ? { metadata: request.metadata } : {}),
      ...(request.tools ? { tools: request.tools } : {}),
      ...(request.toolChoice ? { toolChoice: request.toolChoice } : {}),
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
      ...(request.maxOutputTokens !== undefined
        ? { maxOutputTokens: request.maxOutputTokens }
        : {}),
      signal: request.signal,
    });

    return {
      conversationId,
      personaId,
      stream: this.persistAssistantMessage(conversationId, personaId, modelStream),
      retrievedTranscriptChunks,
    };
  }

  private async *persistAssistantMessage(
    sessionId: string,
    personaId: string,
    stream: AsyncIterable<ChatStreamEvent>,
  ): AsyncIterable<ChatStreamEvent> {
    const deltas: string[] = [];
    let finalText = "";
    let completed = false;
    let failed = false;

    for await (const event of stream) {
      if (event.type === "text.delta") {
        deltas.push(event.delta);
      } else if (event.type === "text.done") {
        finalText = event.text;
      } else if (event.type === "response.completed") {
        completed = true;
      } else if (event.type === "response.failed") {
        failed = true;
      }

      yield event;
    }

    const assistantContent = (finalText || deltas.join("")).trim();
    if (completed && !failed && assistantContent) {
      await this.dependencies.memory.appendMessage({
        sessionId,
        role: "assistant",
        content: assistantContent,
        metadata: { personaId },
      });
    }
  }
}
