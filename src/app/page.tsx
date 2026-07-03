export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1>AI Persona Chat</h1>
      <p>
        API is running. Chat endpoint: <code>POST /api/chat</code>
      </p>
      <p style={{ color: "#666", fontSize: 14 }}>
        Set <code>OPENAI_API_KEY</code> in <code>.env</code> before using chat.
      </p>
    </main>
  );
}
