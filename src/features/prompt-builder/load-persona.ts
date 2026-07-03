import { readFile } from "node:fs/promises";
import path from "node:path";

export interface LoadPersonaOptions {
  /**
   * Directory holding `<persona>.system.md` files. Defaults to `<cwd>/src/personas`.
   * Persona definitions live here as plain markdown, fully independent of code —
   * switching personas only changes which file is read.
   */
  personasDir?: string;
}

function readCwd(): string {
  const runtime = globalThis as { process?: { cwd?: () => string } };
  return runtime.process?.cwd?.() ?? ".";
}

/** Reject ids that could escape the personas directory. */
function assertValidPersona(persona: string): void {
  if (!persona) {
    throw new Error("loadPersona requires a persona id.");
  }
  if (!/^[a-z0-9_-]+$/i.test(persona)) {
    throw new Error(
      `Invalid persona id "${persona}". Use only letters, numbers, hyphens, or underscores.`,
    );
  }
}

/**
 * Read the persona definition markdown for `persona` and return it as the system
 * prompt string. The persona file is `<personasDir>/<persona>.system.md`.
 *
 * Throws a clear error if the persona id is invalid or the file is missing —
 * adding a new persona is purely a matter of dropping in a new `.md` file.
 */
export async function loadPersona(
  persona: string,
  options: LoadPersonaOptions = {},
): Promise<string> {
  const id = persona?.trim();
  assertValidPersona(id);

  const personasDir = options.personasDir ?? path.join(readCwd(), "src", "personas");
  const filePath = path.join(personasDir, `${id}.system.md`);

  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    throw new Error(
      `Persona definition not found for "${id}" (expected ${filePath}). ` +
        `Add ${id}.system.md to ${personasDir}.`,
    );
  }

  const systemPrompt = content.trim();
  if (!systemPrompt) {
    throw new Error(`Persona definition for "${id}" is empty (${filePath}).`);
  }

  return systemPrompt;
}
