export const metadata = {
  title: "AI Persona Chat",
  description: "Simulated tech educator personas based on public content.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
