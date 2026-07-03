"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

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
    subtitle: "Warm Hinglish teaching style · Spring, Redis, full-stack",
  },
  piyush: {
    name: "Piyush Garg",
    subtitle: "Clear English explanations · React, JavaScript, web dev",
  },
};

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `msg_${Date.now()}_${Math.random()}`;
}

export function ChatApp() {
  const [persona, setPersona] = useState<SupportedPersona>("hitesh");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handlePersonaChange = useCallback((next: SupportedPersona) => {
    setPersona(next);
    setMessages([]);
    setError(null);
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) {
      return;
    }

    setInput("");
    setError(null);
    setLoading(true);

    const userMessage: ChatMessage = { id: createId(), role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);

    const conversationHistory: ConversationTurn[] = messages.map(({ role, content }) => ({
      role,
      content,
    }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          persona,
          message: text,
          conversationHistory,
        }),
      });

      const payload = (await response.json()) as ChatApiResponse & ChatApiError;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Chat request failed.");
      }

      setMessages((prev) => [
        ...prev,
        { id: createId(), role: "assistant", content: payload.message },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      // Remove the optimistic user message if the request failed entirely.
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      setInput(text);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, persona]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>AI Persona Chat</h1>
          <p style={styles.subtitle}>
            Ask a technical question — the selected educator&apos;s style and transcript
            context are applied automatically.
          </p>
        </div>
        <div style={styles.personaRow} role="radiogroup" aria-label="Select persona">
          {SUPPORTED_PERSONAS.map((id) => {
            const selected = persona === id;
            const label = PERSONA_LABELS[id];
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => handlePersonaChange(id)}
                style={{
                  ...styles.personaCard,
                  ...(selected ? styles.personaCardSelected : {}),
                }}
              >
                <span style={styles.personaName}>{label.name}</span>
                <span style={styles.personaHint}>{label.subtitle}</span>
              </button>
            );
          })}
        </div>
      </header>

      <section style={styles.thread} aria-live="polite">
        {messages.length === 0 && !loading && (
          <p style={styles.empty}>
            Chatting as <strong>{PERSONA_LABELS[persona].name}</strong>. Try &quot;How does
            Redis caching work?&quot; or &quot;Explain React hooks.&quot;
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              ...styles.bubble,
              ...(msg.role === "user" ? styles.userBubble : styles.assistantBubble),
            }}
          >
            <span style={styles.bubbleRole}>{msg.role === "user" ? "You" : PERSONA_LABELS[persona].name}</span>
            <p style={styles.bubbleText}>{msg.content}</p>
          </div>
        ))}
        {loading && (
          <div style={{ ...styles.bubble, ...styles.assistantBubble }}>
            <span style={styles.bubbleRole}>{PERSONA_LABELS[persona].name}</span>
            <p style={styles.bubbleText}>Thinking…</p>
          </div>
        )}
        <div ref={bottomRef} />
      </section>

      {error && <p style={styles.error}>{error}</p>}

      <footer style={styles.composer}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message ${PERSONA_LABELS[persona].name}…`}
          rows={2}
          disabled={loading}
          style={styles.input}
          aria-label="Message"
        />
        <button
          type="button"
          onClick={() => void sendMessage()}
          disabled={loading || !input.trim()}
          style={{
            ...styles.sendButton,
            ...(loading || !input.trim() ? styles.sendButtonDisabled : {}),
          }}
        >
          Send
        </button>
      </footer>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    maxWidth: 800,
    margin: "0 auto",
    padding: "1.5rem 1rem 1rem",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#111",
  },
  header: { marginBottom: "1rem" },
  title: { margin: 0, fontSize: "1.5rem", fontWeight: 700 },
  subtitle: { margin: "0.35rem 0 1rem", fontSize: "0.9rem", color: "#555", lineHeight: 1.45 },
  personaRow: { display: "flex", gap: "0.75rem", flexWrap: "wrap" },
  personaCard: {
    flex: "1 1 200px",
    textAlign: "left",
    padding: "0.75rem 1rem",
    borderRadius: 10,
    border: "2px solid #e5e5e5",
    background: "#fafafa",
    cursor: "pointer",
  },
  personaCardSelected: {
    borderColor: "#2563eb",
    background: "#eff6ff",
  },
  personaName: { display: "block", fontWeight: 600, fontSize: "0.95rem" },
  personaHint: { display: "block", marginTop: 4, fontSize: "0.75rem", color: "#666", lineHeight: 1.35 },
  thread: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    padding: "0.5rem 0 1rem",
    minHeight: 280,
  },
  empty: { color: "#888", fontSize: "0.9rem", textAlign: "center", marginTop: "2rem" },
  bubble: {
    borderRadius: 12,
    padding: "0.65rem 0.9rem",
    maxWidth: "92%",
  },
  userBubble: {
    alignSelf: "flex-end",
    background: "#2563eb",
    color: "#fff",
  },
  assistantBubble: {
    alignSelf: "flex-start",
    background: "#f3f4f6",
    color: "#111",
  },
  bubbleRole: {
    display: "block",
    fontSize: "0.7rem",
    fontWeight: 600,
    opacity: 0.75,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  bubbleText: { margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: "0.95rem" },
  error: {
    margin: "0 0 0.5rem",
    padding: "0.5rem 0.75rem",
    borderRadius: 8,
    background: "#fef2f2",
    color: "#b91c1c",
    fontSize: "0.85rem",
  },
  composer: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "flex-end",
    borderTop: "1px solid #e5e5e5",
    paddingTop: "0.75rem",
  },
  input: {
    flex: 1,
    resize: "none",
    padding: "0.65rem 0.75rem",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    fontSize: "0.95rem",
    fontFamily: "inherit",
    lineHeight: 1.4,
  },
  sendButton: {
    padding: "0.65rem 1.1rem",
    borderRadius: 10,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  sendButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
};
