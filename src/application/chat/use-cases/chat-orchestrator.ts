import type { ConversationHistory, ConversationMessage } from "@/domain/conversations/conversation";
import type { PersonaConfig, RetrievedTranscriptChunk } from "@/domain/personas/persona-config";

import type { ConversationHistoryStore } from "../ports/conversation-history-store";
import type { PersonaRepository } from "../ports/persona-repository";
import type {
  ChatStreamEvent,
  ChatToolChoice,
  ChatToolDefinition,
  StreamingLanguageModel,
} from "../ports/streaming-language-model";
import type { SystemPromptBuilder } from "../ports/system-prompt-builder";
import type { TranscriptRetriever } from "../ports/transcript-retriever";

export interface ChatOrchestratorDependencies {
  personas: PersonaRepository;
  conversationHistory: ConversationHistoryStore;
  transcripts: TranscriptRetriever;
  promptBuilder: SystemPromptBuilder;
  languageModel: StreamingLanguageModel;
}

export interface ChatOrchestratorRequest {
  conversationId: string;
  personaId: string;
  userMessage: string;
  userId?: string;
  transcriptLimit?: number;
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
): ConversationMessage[] {
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
      await this.dependencies.conversationHistory.loadHistory({
        conversationId,
        personaId,
        ...(userId ? { userId } : {}),
        signal: request.signal,
      }),
    );

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

    const systemPrompt = this.dependencies.promptBuilder.build({
      persona,
      retrievedTranscriptChunks,
      previousConversationSummary: history.summary,
      currentUserMessage: userMessage,
    });

    const stream = this.dependencies.languageModel.streamResponse({
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
      stream,
      retrievedTranscriptChunks,
    };
  }
}
