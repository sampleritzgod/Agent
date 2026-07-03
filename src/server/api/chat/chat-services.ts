import { ChatOrchestrator } from "@/application/chat";
import {
  ConversationMemoryManager,
  ExtractiveConversationSummarizer,
} from "@/application/memory";
import { loadConversationMemoryConfig } from "@/config/memory";
import { loadOpenAIResponsesConfig } from "@/config/openai";
import { loadProjectPaths } from "@/config/paths";
import { OpenAIResponsesStreamingClient } from "@/infrastructure/ai/openai";
import { PromptBuilder } from "@/infrastructure/ai/prompts/build-system-prompt";
import { InMemoryConversationMemoryStore } from "@/infrastructure/cache";
import { LocalTranscriptRetriever } from "@/infrastructure/vector/local-transcript-retriever";
import { FilePersonaRepository } from "@/lib/personas";

const conversationMemoryStore = new InMemoryConversationMemoryStore();
const conversationSummarizer = new ExtractiveConversationSummarizer();

export function createChatOrchestrator(): ChatOrchestrator {
  const paths = loadProjectPaths();
  const openAI = loadOpenAIResponsesConfig();
  const memory = loadConversationMemoryConfig();

  return new ChatOrchestrator({
    personas: new FilePersonaRepository(paths.personasRoot),
    memory: new ConversationMemoryManager({
      store: conversationMemoryStore,
      summarizer: conversationSummarizer,
      limits: memory,
    }),
    transcripts: new LocalTranscriptRetriever({
      dataRoot: paths.dataRoot,
      defaultLimit: 6,
    }),
    promptBuilder: new PromptBuilder(),
    languageModel: new OpenAIResponsesStreamingClient({
      apiKey: openAI.apiKey,
      model: openAI.model,
      ...(openAI.apiBaseUrl ? { baseUrl: openAI.apiBaseUrl } : {}),
      ...(openAI.organization ? { organization: openAI.organization } : {}),
      ...(openAI.project ? { project: openAI.project } : {}),
      fetchImpl: fetch,
    }),
  });
}
