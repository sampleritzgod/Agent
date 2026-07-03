import type { PersonaConfig } from "@/domain/personas/persona-config";

import { PersonaManager } from "./persona-manager";

export async function listPersonaIds(personasRoot: string): Promise<string[]> {
  return new PersonaManager({ personasRoot }).listPersonaIds();
}

export async function listEnabledPersonas(personasRoot: string): Promise<PersonaConfig[]> {
  return new PersonaManager({ personasRoot }).listEnabledPersonas();
}

export async function listPersonas(personasRoot: string): Promise<PersonaConfig[]> {
  return new PersonaManager({ personasRoot }).listPersonas();
}
