/**
 * Operational script: analyze cleaned transcripts for one creator and write a
 * single persona.json. Analysis only — no chat, no RAG.
 *
 * Usage:
 *   OPENAI_API_KEY=... tsx scripts/persona/analyze-persona.ts <input> [--creator name] [--out path] [--model m]
 *
 * <input> is either:
 *   - a .json file containing an array of strings (transcript chunks), or
 *   - a directory containing .txt/.md transcript files (one chunk per file).
 *
 * Example:
 *   OPENAI_API_KEY=... tsx scripts/persona/analyze-persona.ts ./transcripts --creator "@chaiaurcode"
 */

import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { analyzePersona } from "@/features/persona-analyzer";

interface CliArgs {
  input: string;
  creator?: string;
  outPath: string;
  model?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const positionals: string[] = [];
  let creator: string | undefined;
  let outPath: string | undefined;
  let model: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--creator") {
      creator = argv[(i += 1)];
    } else if (arg === "--out") {
      outPath = argv[(i += 1)];
    } else if (arg === "--model") {
      model = argv[(i += 1)];
    } else {
      positionals.push(arg);
    }
  }

  const input = positionals[0];
  if (!input) {
    throw new Error(
      "Missing input.\nUsage: tsx scripts/persona/analyze-persona.ts <input> [--creator name] [--out path] [--model m]",
    );
  }

  return {
    input,
    ...(creator ? { creator } : {}),
    outPath: outPath ?? "persona.json",
    ...(model ? { model } : {}),
  };
}

async function loadChunks(input: string): Promise<string[]> {
  const info = await stat(input);

  if (info.isFile()) {
    const raw = await readFile(input, "utf8");
    if (input.endsWith(".json")) {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.every((c) => typeof c === "string")) {
        throw new Error("JSON input must be an array of strings.");
      }
      return parsed;
    }
    return [raw];
  }

  const entries = await readdir(input, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && /\.(txt|md)$/i.test(e.name))
    .map((e) => path.join(input, e.name))
    .sort();

  if (files.length === 0) {
    throw new Error(`No .txt or .md transcript files found in ${input}`);
  }

  return Promise.all(files.map((file) => readFile(file, "utf8")));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const chunks = await loadChunks(args.input);

  console.log(`Analyzing ${chunks.length} transcript chunk(s)...`);
  const persona = await analyzePersona(chunks, {
    ...(args.creator ? { creator: args.creator } : {}),
    ...(args.model ? { model: args.model } : {}),
  });

  await mkdir(path.dirname(path.resolve(args.outPath)), { recursive: true });
  await writeFile(args.outPath, `${JSON.stringify(persona, null, 2)}\n`, "utf8");
  console.log(`Wrote persona profile to: ${args.outPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
