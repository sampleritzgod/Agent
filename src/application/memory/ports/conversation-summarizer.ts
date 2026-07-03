import type { ConversationMessage } from "@/domain/conversations";

export interface SummarizeConversationInput {
  previousSummary?: string;
  messages: ConversationMessage[];
  maxSummaryChars?: number;
  signal?: AbortSignal;
}

export interface ConversationSummarizer {
  summarize(input: SummarizeConversationInput): Promise<string>;
}
