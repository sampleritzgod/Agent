import path from "node:path";

import { PersonaManager } from "@/features/personas";

import { ChatOrchestrator } from "./chat-orchestrator";
import {
  ConversationMemoryManager,
  ExtractiveConversationSummarizer,
  InMemoryConversationMemoryStore,
  type ConversationMemoryLimits,
} from "./conversation-memory";
import { LocalTranscriptRetriever } from "./transcript-retriever";
import { OpenAIResponsesStreamingClient } from "./openai-streaming-client";

type EnvSource = Record<string, string | undefined>;

function readEnv(): EnvSource {
  const runtime = globalThis as { process?: { env?: EnvSource } };
  return runtime.process?.env ?? {};
}

function readCwd(): string {
  const runtime = globalThis as { process?: { cwd?: () => string } };
  return runtime.process?.cwd?.() ?? ".";
}

function optionalEnv(env: EnvSource, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function readPositiveInt(env: EnvSource, key: string, fallback: number): number {
  const value = Number.parseInt(env[key] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readMemoryLimits(env: EnvSource): ConversationMemoryLimits {
  return {
    maxRecentMessages: readPositiveInt(env, "CONVERSATION_MEMORY_MAX_RECENT_MESSAGES", 16),
    maxContextTokens: readPositiveInt(env, "CONVERSATION_MEMORY_MAX_CONTEXT_TOKENS", 3_000),
    maxSummaryChars: readPositiveInt(env, "CONVERSATION_MEMORY_MAX_SUMMARY_CHARS", 2_000),
  };
}

// Memory is process-local, so the store and summarizer are shared across requests.
const conversationMemoryStore = new InMemoryConversationMemoryStore();
const conversationSummarizer = new ExtractiveConversationSummarizer();

export function createChatOrchestrator(): ChatOrchestrator {
  const env = readEnv();
  const projectRoot = readCwd();
  const dataRoot = path.join(projectRoot, "src", "data");
  const personasRoot = path.join(dataRoot, "personas");

  const apiKey = optionalEnv(env, "OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  const model =
    optionalEnv(env, "OPENAI_RESPONSES_MODEL") ??
    optionalEnv(env, "OPENAI_CHAT_MODEL") ??
    "gpt-5.1";
  const baseUrl = optionalEnv(env, "OPENAI_API_BASE_URL");
  const organization = optionalEnv(env, "OPENAI_ORGANIZATION");
  const project = optionalEnv(env, "OPENAI_PROJECT");

  return new ChatOrchestrator({
    personas: new PersonaManager({ personasRoot }),
    memory: new ConversationMemoryManager({
      store: conversationMemoryStore,
      summarizer: conversationSummarizer,
      limits: readMemoryLimits(env),
    }),
    transcripts: new LocalTranscriptRetriever({
      dataRoot,
      defaultLimit: 6,
    }),
    languageModel: new OpenAIResponsesStreamingClient({
      apiKey,
      model,
      ...(baseUrl ? { baseUrl } : {}),
      ...(organization ? { organization } : {}),
      ...(project ? { project } : {}),
      fetchImpl: fetch,
    }),
  });
}
