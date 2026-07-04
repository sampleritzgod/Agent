"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

import type { ConversationTurn } from "@/features/chat/chat-types";
import { SUPPORTED_PERSONAS, type SupportedPersona } from "@/features/chat/chat-types";

interface ChatMessage extends ConversationTurn {
  id: string;
}

interface ChatApiResponse {
  message: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  model?: string;
}

interface ChatApiError {
  error?: { code?: string; message?: string };
}

const PERSONA_LABELS: Record<SupportedPersona, { name: string; subtitle: string }> = {
  hitesh: {
    name: "Hitesh Choudhary",
    subtitle: "Warm Hinglish teaching style · full-stack, DevOps, career guidance",
  },
  piyush: {
    name: "Piyush Garg",
    subtitle: "Clear English explanations · React, Node.js, system design",
  },
};

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `msg_${Date.now()}_${Math.random()}`;
}

/** Build a per-persona record with an independent initial value for each key. */
function perPersona<T>(init: () => T): Record<SupportedPersona, T> {
  return SUPPORTED_PERSONAS.reduce((acc, id) => {
    acc[id] = init();
    return acc;
  }, {} as Record<SupportedPersona, T>);
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function ChatApp() {
  const [persona, setPersona] = useState<SupportedPersona>("hitesh");
  // Each persona keeps its own conversation, error, and last-failed message so
  // switching personas never deletes or mixes histories — it just reveals the
  // other persona's independent state, and switching back restores it.
  const [histories, setHistories] = useState<Record<SupportedPersona, ChatMessage[]>>(
    () => perPersona<ChatMessage[]>(() => []),
  );
  const [errors, setErrors] = useState<Record<SupportedPersona, string | null>>(() =>
    perPersona<string | null>(() => null),
  );
  const [input, setInput] = useState("");
  // Which persona currently has a request in flight (null when idle).
  const [loadingPersona, setLoadingPersona] = useState<SupportedPersona | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Guards against duplicate in-flight submissions even before state settles.
  const inFlightRef = useRef(false);
  // Per-persona text of the last failed send, used by the retry button.
  const lastFailedRef = useRef<Record<SupportedPersona, string | null>>(
    perPersona<string | null>(() => null),
  );

  const messages = histories[persona];
  const error = errors[persona];
  const loading = loadingPersona !== null;

  const updateHistory = useCallback(
    (target: SupportedPersona, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setHistories((prev) => ({ ...prev, [target]: updater(prev[target]) }));
    },
    [],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loadingPersona]);

  // Auto-grow the textarea up to its max-height.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handlePersonaChange = useCallback(
    (next: SupportedPersona) => {
      if (next === persona) return;
      // Only switch the active persona — histories are preserved and restored.
      setPersona(next);
    },
    [persona],
  );

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || inFlightRef.current) {
        return;
      }

      // Bind this request to the persona active at send time, so a response
      // always lands in the right conversation even if the user switches.
      const target = persona;

      inFlightRef.current = true;
      setErrors((prev) => ({ ...prev, [target]: null }));
      lastFailedRef.current[target] = null;
      setLoadingPersona(target);

      const userMessage: ChatMessage = { id: createId(), role: "user", content: trimmed };

      // History is this persona's conversation before the new message.
      const conversationHistory: ConversationTurn[] = histories[target].map(
        ({ role, content }) => ({ role, content }),
      );

      updateHistory(target, (prev) => [...prev, userMessage]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ persona: target, message: trimmed, conversationHistory }),
        });

        const payload = (await response.json()) as ChatApiResponse & ChatApiError;

        if (!response.ok) {
          throw new Error(payload.error?.message ?? "Chat request failed.");
        }

        updateHistory(target, (prev) => [
          ...prev,
          { id: createId(), role: "assistant", content: payload.message },
        ]);
      } catch (err) {
        // A rejected fetch (TypeError) means the browser could not reach the
        // server at all — surface a connection message rather than "Failed to
        // fetch". Server-side errors already arrive as friendly messages.
        const isNetworkFailure = err instanceof TypeError;
        const message = isNetworkFailure
          ? "Unable to connect to the AI service. Please check your connection and try again."
          : err instanceof Error && err.message
            ? err.message
            : "Something went wrong. Please try again.";
        setErrors((prev) => ({ ...prev, [target]: message }));
        lastFailedRef.current[target] = trimmed;
        // Roll back the optimistic user message so retry doesn't duplicate it.
        updateHistory(target, (prev) => prev.filter((m) => m.id !== userMessage.id));
      } finally {
        inFlightRef.current = false;
        setLoadingPersona(null);
      }
    },
    [histories, persona, updateHistory],
  );

  const sendMessage = useCallback(() => {
    const text = input;
    setInput("");
    void submit(text);
  }, [input, submit]);

  const retry = useCallback(() => {
    const text = lastFailedRef.current[persona];
    if (text) {
      void submit(text);
    }
  }, [persona, submit]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const activeName = PERSONA_LABELS[persona].name;

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <h1 className="chat-title">AI Persona Chat</h1>
        <p className="chat-subtitle">
          Ask a technical question — the selected educator&apos;s style and transcript
          context are applied automatically.
        </p>
        <div className="persona-row" role="radiogroup" aria-label="Select persona">
          {SUPPORTED_PERSONAS.map((id) => {
            const selected = persona === id;
            const label = PERSONA_LABELS[id];
            const content = (
              <>
                <span className="persona-name">{label.name}</span>
                <span className="persona-hint">{label.subtitle}</span>
              </>
            );
            return selected ? (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked="true"
                onClick={() => handlePersonaChange(id)}
                className="persona-card selected"
              >
                {content}
              </button>
            ) : (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked="false"
                onClick={() => handlePersonaChange(id)}
                className="persona-card"
              >
                {content}
              </button>
            );
          })}
        </div>
      </header>

      <section className="chat-thread" aria-live="polite">
        {messages.length === 0 && loadingPersona !== persona && (
          <p className="chat-empty">
            Chatting as <strong>{activeName}</strong>.
            <br />
            Try &quot;How does Redis caching work?&quot; or &quot;Explain React hooks with an
            example.&quot;
          </p>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`chat-row ${msg.role}`}>
            <div className="bubble">
              <span className="bubble-role">{msg.role === "user" ? "You" : activeName}</span>
              {msg.role === "assistant" ? (
                <AssistantMarkdown content={msg.content} />
              ) : (
                <div className="user-text">{msg.content}</div>
              )}
            </div>
          </div>
        ))}

        {loadingPersona === persona && (
          <div className="chat-row assistant">
            <div className="bubble">
              <span className="bubble-role">{activeName}</span>
              <span className="thinking">
                Thinking
                <span className="thinking-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </section>

      {error && (
        <div className="chat-error" role="alert">
          <span>{error}</span>
          {lastFailedRef.current[persona] && (
            <button type="button" className="retry-btn" onClick={retry} disabled={loading}>
              Retry
            </button>
          )}
        </div>
      )}

      <footer className="composer">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message ${activeName}…`}
          rows={1}
          disabled={loading}
          aria-label="Message"
        />
        <button
          type="button"
          className="send-btn"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >
          {loading ? "…" : "Send"}
        </button>
      </footer>
      <p className="composer-hint">Enter to send · Shift + Enter for a new line</p>
    </div>
  );
}
