export interface ConversationMemoryConfig {
  maxRecentMessages: number;
  maxContextTokens: number;
  maxSummaryChars: number;
}

export type EnvSource = Record<string, string | undefined>;

function readProcessEnv(): EnvSource {
  const runtime = globalThis as {
    process?: { env?: EnvSource };
  };
  return runtime.process?.env ?? {};
}

function readPositiveInt(
  env: EnvSource,
  key: string,
  fallback: number,
): number {
  const value = Number.parseInt(env[key] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadConversationMemoryConfig(
  env: EnvSource = readProcessEnv(),
): ConversationMemoryConfig {
  return {
    maxRecentMessages: readPositiveInt(
      env,
      "CONVERSATION_MEMORY_MAX_RECENT_MESSAGES",
      16,
    ),
    maxContextTokens: readPositiveInt(
      env,
      "CONVERSATION_MEMORY_MAX_CONTEXT_TOKENS",
      3_000,
    ),
    maxSummaryChars: readPositiveInt(
      env,
      "CONVERSATION_MEMORY_MAX_SUMMARY_CHARS",
      2_000,
    ),
  };
}
