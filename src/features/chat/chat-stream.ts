import type { ChatStreamEvent } from "./chat-model";

interface SseEnvelope {
  type: string;
  data: unknown;
}

function sseFrame(envelope: SseEnvelope): string {
  return `event: ${envelope.type}\ndata: ${JSON.stringify(envelope.data)}\n\n`;
}

function toClientEvent(event: ChatStreamEvent): SseEnvelope | undefined {
  switch (event.type) {
    case "response.started":
      return {
        type: "start",
        data: { responseId: event.responseId },
      };
    case "text.delta":
      return {
        type: "delta",
        data: { text: event.delta },
      };
    case "text.done":
      return {
        type: "text_done",
        data: { text: event.text },
      };
    case "response.completed":
      return {
        type: "done",
        data: {
          responseId: event.responseId,
          usage: event.usage,
        },
      };
    case "response.failed":
      return {
        type: "error",
        data: {
          code: event.error.code ?? "MODEL_STREAM_ERROR",
          message: event.error.message,
          type: event.error.type,
        },
      };
    case "response.event":
      return {
        type: "model_event",
        data: {
          event: event.event,
          data: event.data,
        },
      };
  }
}

function safeStreamError(error: unknown): { code: string; message: string } {
  if (error instanceof Error && error.message.includes("OpenAI Responses API")) {
    return {
      code: "MODEL_STREAM_ERROR",
      message: "The model provider could not complete the streamed response.",
    };
  }

  return {
    code: "STREAM_ERROR",
    message:
      error instanceof Error
        ? error.message
        : "The chat stream failed before completion.",
  };
}

export interface CreateChatStreamResponseOptions {
  requestId: string;
  conversationId: string;
  personaId: string;
  stream: AsyncIterable<ChatStreamEvent>;
}

export function createChatStreamResponse(
  options: CreateChatStreamResponseOptions,
): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          sseFrame({
            type: "meta",
            data: {
              requestId: options.requestId,
              conversationId: options.conversationId,
              personaId: options.personaId,
            },
          }),
        ),
      );

      try {
        for await (const event of options.stream) {
          const envelope = toClientEvent(event);
          if (!envelope) {
            continue;
          }
          controller.enqueue(encoder.encode(sseFrame(envelope)));
        }
      } catch (error) {
        const safeError = safeStreamError(error);
        console.error(`[api:${options.requestId}:stream]`, error);

        controller.enqueue(
          encoder.encode(
            sseFrame({
              type: "error",
              data: {
                code: safeError.code,
                message: safeError.message,
                requestId: options.requestId,
              },
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
