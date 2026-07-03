import { ChatOrchestrator } from "@/application/chat";
import { loadOpenAIResponsesConfig } from "@/config/openai";
import { loadProjectPaths } from "@/config/paths";
import { OpenAIResponsesStreamingClient } from "@/infrastructure/ai/openai";
import { PromptBuilder } from "@/infrastructure/ai/prompts/build-system-prompt";
import { StatelessConversationHistoryStore } from "@/infrastructure/cache/stateless-conversation-history-store";
import { LocalTranscriptRetriever } from "@/infrastructure/vector/local-transcript-retriever";
import { FilePersonaRepository } from "@/lib/personas";

export function createChatOrchestrator(): ChatOrchestrator {
  const paths = loadProjectPaths();
  const openAI = loadOpenAIResponsesConfig();

  return new ChatOrchestrator({
    personas: new FilePersonaRepository(paths.personasRoot),
    conversationHistory: new StatelessConversationHistoryStore(),
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
