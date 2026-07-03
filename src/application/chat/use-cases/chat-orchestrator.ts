import type { ConversationHistory, ConversationMessage } from "@/domain/conversations/conversation";
import type { PersonaConfig, RetrievedTranscriptChunk } from "@/domain/personas/persona-config";
import type { ConversationMemory } from "@/application/memory";

import type { PersonaRepository } from "../ports/persona-repository";
import type {
  ChatModelMessage,
  ChatStreamEvent,
  ChatToolChoice,
  ChatToolDefinition,
  StreamingLanguageModel,
} from "../ports/streaming-language-model";
import type { SystemPromptBuilder } from "../ports/system-prompt-builder";
import type { TranscriptRetriever } from "../ports/transcript-retriever";

export interface ChatOrchestratorDependencies {
  personas: PersonaRepository;
  memory: ConversationMemory;
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

    const systemPrompt = this.dependencies.promptBuilder.build({
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
