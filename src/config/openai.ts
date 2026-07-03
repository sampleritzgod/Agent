export interface OpenAIResponsesConfig {
  apiKey: string;
  model: string;
  apiBaseUrl?: string;
  organization?: string;
  project?: string;
}

export type EnvSource = Record<string, string | undefined>;

function readProcessEnv(): EnvSource {
  const runtime = globalThis as {
    process?: { env?: EnvSource };
  };
  return runtime.process?.env ?? {};
}

function optionalEnv(env: EnvSource, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function loadOpenAIResponsesConfig(
  env: EnvSource = readProcessEnv(),
): OpenAIResponsesConfig {
  const apiKey = optionalEnv(env, "OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  return {
    apiKey,
    model:
      optionalEnv(env, "OPENAI_RESPONSES_MODEL") ??
      optionalEnv(env, "OPENAI_CHAT_MODEL") ??
      "gpt-5.1",
    apiBaseUrl: optionalEnv(env, "OPENAI_API_BASE_URL"),
    organization: optionalEnv(env, "OPENAI_ORGANIZATION"),
    project: optionalEnv(env, "OPENAI_PROJECT"),
  };
}
