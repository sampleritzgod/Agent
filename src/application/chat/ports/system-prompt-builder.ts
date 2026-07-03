import type {
  PersonaConfig,
  RetrievedTranscriptChunk,
} from "@/domain/personas/persona-config";

export interface BuildSystemPromptInput {
  persona: PersonaConfig;
  retrievedTranscriptChunks?: RetrievedTranscriptChunk[];
  previousConversationSummary?: string;
  currentUserMessage: string;
}

export interface SystemPromptBuilder {
  build(input: BuildSystemPromptInput): string;
}
