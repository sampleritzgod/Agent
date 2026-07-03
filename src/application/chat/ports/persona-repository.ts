import type { PersonaConfig } from "@/domain/personas/persona-config";

export interface PersonaRepository {
  getPersonaById(personaId: string): Promise<PersonaConfig>;
}
