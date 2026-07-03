import type {
  ChatModelError,
  ChatModelUsage,
  ChatStreamEvent,
  StreamModelResponseInput,
  StreamingLanguageModel,
} from "./chat-model";

export interface OpenAIResponsesStreamingClientOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  organization?: string;
  project?: string;
  defaultTemperature?: number;
  defaultMaxOutputTokens?: number;
  store?: boolean;
  fetchImpl: typeof fetch;
}

interface ServerSentEvent {
  event?: string;
  data: string;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compact(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toResponseInput(input: StreamModelResponseInput): Array<Record<string, string>> {
  return input.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function extractResponseId(event: Record<string, unknown>): string | undefined {
  const response = event.response;
  if (isRecord(response)) {
    return getString(response.id);
  }

  return getString(event.response_id) ?? getString(event.id);
}

function extractUsage(rawUsage: unknown): ChatModelUsage | undefined {
  if (!isRecord(rawUsage)) {
    return undefined;
  }

  const usage: ChatModelUsage = { raw: rawUsage };
  if (typeof rawUsage.input_tokens === "number") {
    usage.inputTokens = rawUsage.input_tokens;
  }
  if (typeof rawUsage.output_tokens === "number") {
    usage.outputTokens = rawUsage.output_tokens;
  }
  if (typeof rawUsage.total_tokens === "number") {
    usage.totalTokens = rawUsage.total_tokens;
  }

  return usage;
}

function extractCompletedUsage(event: Record<string, unknown>): ChatModelUsage | undefined {
  const response = event.response;
  if (isRecord(response)) {
    return extractUsage(response.usage);
  }

  return extractUsage(event.usage);
}

function extractError(event: Record<string, unknown>): ChatModelError {
  const error = event.error;
  if (isRecord(error)) {
    return {
      message: getString(error.message) ?? "OpenAI Responses API stream failed.",
      code: getString(error.code),
      type: getString(error.type),
    };
  }

  return {
    message: getString(event.message) ?? "OpenAI Responses API stream failed.",
    code: getString(event.code),
    type: getString(event.type),
  };
}

function mapOpenAIEvent(
  payload: unknown,
  eventName: string | undefined,
): ChatStreamEvent {
  if (!isRecord(payload)) {
    return {
      type: "response.event",
      event: eventName ?? "message",
      data: payload,
    };
  }

  const type = getString(payload.type) ?? eventName ?? "message";

  if (type === "response.created" || type === "response.in_progress") {
    return {
      type: "response.started",
      responseId: extractResponseId(payload),
      rawEvent: payload,
    };
  }

  if (type === "response.output_text.delta") {
    return {
      type: "text.delta",
      delta: getString(payload.delta) ?? "",
      rawEvent: payload,
    };
  }

  if (type === "response.output_text.done") {
    return {
      type: "text.done",
      text: getString(payload.text) ?? "",
      rawEvent: payload,
    };
  }

  if (type === "response.completed") {
    return {
      type: "response.completed",
      responseId: extractResponseId(payload),
      usage: extractCompletedUsage(payload),
      rawEvent: payload,
    };
  }

  if (type === "response.failed" || type === "response.incomplete") {
    return {
      type: "response.failed",
      error: extractError(payload),
      rawEvent: payload,
    };
  }

  return {
    type: "response.event",
    event: type,
    data: payload,
  };
}

function parseServerSentEvent(rawEvent: string): ServerSentEvent | undefined {
  const lines = rawEvent.split("\n");
  const dataLines: string[] = [];
  let event: string | undefined;

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return undefined;
  }

  return {
    ...(event ? { event } : {}),
    data: dataLines.join("\n"),
  };
}

async function* readServerSentEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<ServerSentEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseServerSentEvent(rawEvent);
        if (event) {
          yield event;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }

    buffer += decoder.decode().replace(/\r\n/g, "\n");
    const event = parseServerSentEvent(buffer);
    if (event) {
      yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

/** OpenAI Responses API streaming client implementing {@link StreamingLanguageModel}. */
export class OpenAIResponsesStreamingClient implements StreamingLanguageModel {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAIResponsesStreamingClientOptions) {
    const apiKey = compact(options.apiKey);
    if (!apiKey) {
      throw new Error("OpenAIResponsesStreamingClient requires an apiKey.");
    }

    const model = compact(options.model);
    if (!model) {
      throw new Error("OpenAIResponsesStreamingClient requires a model.");
    }

    if (typeof options.fetchImpl !== "function") {
      throw new Error("OpenAIResponsesStreamingClient requires fetchImpl.");
    }

    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl;
  }

  async *streamResponse(
    input: StreamModelResponseInput,
  ): AsyncIterable<ChatStreamEvent> {
    const body: Record<string, unknown> = {
      model: input.model ?? this.options.model,
      instructions: input.systemPrompt,
      input: toResponseInput(input),
      stream: true,
      store: this.options.store ?? false,
    };

    const temperature = input.temperature ?? this.options.defaultTemperature;
    if (temperature !== undefined) {
      body.temperature = temperature;
    }

    const maxOutputTokens =
      input.maxOutputTokens ?? this.options.defaultMaxOutputTokens;
    if (maxOutputTokens !== undefined) {
      body.max_output_tokens = maxOutputTokens;
    }

    if (input.tools && input.tools.length > 0) {
      body.tools = input.tools;
    }

    if (input.toolChoice) {
      body.tool_choice = input.toolChoice;
    }

    if (input.metadata) {
      body.metadata = input.metadata;
    }

    if (input.userId) {
      body.safety_identifier = input.userId.slice(0, 64);
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${this.options.apiKey}`,
    };

    if (this.options.organization) {
      headers["OpenAI-Organization"] = this.options.organization;
    }

    if (this.options.project) {
      headers["OpenAI-Project"] = this.options.project;
    }

    const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: input.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(
        `OpenAI Responses API request failed (${response.status}): ${detail}`,
      );
    }

    if (!response.body) {
      throw new Error("OpenAI Responses API returned no response body to stream.");
    }

    for await (const event of readServerSentEvents(response.body)) {
      if (event.data === "[DONE]") {
        continue;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        yield {
          type: "response.event",
          event: event.event ?? "message",
          data: event.data,
        };
        continue;
      }

      yield mapOpenAIEvent(payload, event.event);
    }
  }
}
