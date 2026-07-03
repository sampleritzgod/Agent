import type { ConversationMessage } from "@/domain/conversations/conversation";
import type {
  PersonaConfig,
  RetrievedTranscriptChunk,
} from "@/domain/personas/persona-config";

export interface RetrieveTranscriptChunksInput {
  conversationId: string;
  personaId: string;
  persona: PersonaConfig;
  userMessage: string;
  history: ConversationMessage[];
  limit?: number;
  signal?: AbortSignal;
}

export interface TranscriptRetriever {
  retrieve(input: RetrieveTranscriptChunksInput): Promise<RetrievedTranscriptChunk[]>;
}
