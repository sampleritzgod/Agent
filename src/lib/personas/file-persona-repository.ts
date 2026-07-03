import type { PersonaRepository } from "@/application/chat/ports/persona-repository";
import type { PersonaConfig } from "@/domain/personas/persona-config";

import { loadPersonaById } from "./load-persona";

export class FilePersonaRepository implements PersonaRepository {
  constructor(private readonly personasRoot: string) {}

  getPersonaById(personaId: string): Promise<PersonaConfig> {
    return loadPersonaById(this.personasRoot, personaId);
  }
}
