import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PersonaConfig } from "@/domain/personas/persona-config";

import { validatePersonaConfig } from "./validate-persona-config";

export async function loadPersonaFromFile(filePath: string): Promise<PersonaConfig> {
  const raw = await readFile(filePath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const config = validatePersonaConfig(parsed);

  if (config.id !== path.basename(path.dirname(filePath))) {
    throw new Error(
      `Persona id "${config.id}" does not match folder "${path.basename(path.dirname(filePath))}".`,
    );
  }

  return config;
}

export async function loadPersonaById(
  personasRoot: string,
  personaId: string,
): Promise<PersonaConfig> {
  const filePath = path.join(personasRoot, personaId, "persona.json");
  return loadPersonaFromFile(filePath);
}
