import type { PersonaConfig } from "@/domain/personas/persona-config";

import { PersonaManager } from "./persona-manager";

export async function loadPersonaFromFile(filePath: string): Promise<PersonaConfig> {
  return new PersonaManager({ personasRoot: "" }).loadPersonaFromFile(filePath);
}

export async function loadPersonaById(
  personasRoot: string,
  personaId: string,
): Promise<PersonaConfig> {
  return new PersonaManager({ personasRoot }).getPersona(personaId);
}
