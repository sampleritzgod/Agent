import type { PersonaRepository } from "@/application/chat/ports/persona-repository";
import type { PersonaConfig } from "@/domain/personas/persona-config";

import { PersonaManager } from "./persona-manager";

export class FilePersonaRepository implements PersonaRepository {
  private readonly manager: PersonaManager;

  constructor(personasRoot: string) {
    this.manager = new PersonaManager({ personasRoot });
  }

  getPersonaById(personaId: string): Promise<PersonaConfig> {
    return this.manager.getPersona(personaId);
  }
}
