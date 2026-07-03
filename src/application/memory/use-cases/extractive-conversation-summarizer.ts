import type {
  ConversationSummarizer,
  SummarizeConversationInput,
} from "../ports/conversation-summarizer";

const DEFAULT_MAX_SUMMARY_CHARS = 2_000;

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxChars - 14)).trimEnd()}\n[truncated]`;
}

export class ExtractiveConversationSummarizer implements ConversationSummarizer {
  async summarize(input: SummarizeConversationInput): Promise<string> {
    const maxSummaryChars = input.maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS;
    const lines = input.messages.map((message) => {
      const timestamp = message.createdAt ? ` at ${message.createdAt}` : "";
      return `- ${message.role}${timestamp}: ${message.content}`;
    });

    const summary = [
      input.previousSummary
        ? `Previous summary:\n${input.previousSummary.trim()}`
        : "",
      lines.length > 0 ? `Earlier conversation:\n${lines.join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return truncate(summary || "No previous conversation context.", maxSummaryChars);
  }
}
