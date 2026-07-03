import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { PersonaConfig } from "@/domain/personas/persona-config";

import { loadPersonaFromFile } from "./load-persona";

async function isPersonaDirectory(entryPath: string): Promise<boolean> {
  try {
    const personaFile = path.join(entryPath, "persona.json");
    const fileStat = await stat(personaFile);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

export async function listPersonaIds(personasRoot: string): Promise<string[]> {
  const entries = await readdir(personasRoot, { withFileTypes: true });
  const ids: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) {
      continue;
    }

    const entryPath = path.join(personasRoot, entry.name);
    if (await isPersonaDirectory(entryPath)) {
      ids.push(entry.name);
    }
  }

  return ids.sort();
}

export async function listEnabledPersonas(personasRoot: string): Promise<PersonaConfig[]> {
  const ids = await listPersonaIds(personasRoot);
  const personas: PersonaConfig[] = [];

  for (const id of ids) {
    const config = await loadPersonaFromFile(path.join(personasRoot, id, "persona.json"));
    if (config.enabled) {
      personas.push(config);
    }
  }

  return personas;
}
