import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home directory makes Next infer the wrong
  // workspace root. Pin the tracing root to this project so file tracing and
  // process.cwd() resolve consistently inside Vercel's serverless functions.
  outputFileTracingRoot: path.join(__dirname),
  // These files are read from disk at runtime via fs.readFile, but nothing
  // imports them statically, so Next won't include them in the serverless
  // bundle unless we say so. Without this the deployed /api/chat route cannot
  // find the persona definitions, transcript chunks, or video ingestion data.
  outputFileTracingIncludes: {
    "/api/chat": [
      "./src/personas/**/*",
      "./src/data/chunks/**/*",
      "./src/data/ingestion/raw/**/*",
    ],
  },
};

export default nextConfig;
