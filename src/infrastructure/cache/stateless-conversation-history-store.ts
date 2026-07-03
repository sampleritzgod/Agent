import type {
  ConversationHistoryStore,
  LoadConversationHistoryInput,
} from "@/application/chat/ports/conversation-history-store";
import type { ConversationHistory } from "@/domain/conversations/conversation";

export class StatelessConversationHistoryStore implements ConversationHistoryStore {
  loadHistory(_input: LoadConversationHistoryInput): Promise<ConversationHistory> {
    return Promise.resolve({ messages: [] });
  }
}
