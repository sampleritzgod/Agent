import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { PersonaConfig } from "@/domain/personas/persona-config";

import { PersonaManagerError } from "./persona-errors";
import { validatePersonaConfig } from "./validate-persona-config";

export type Persona = PersonaConfig;

export interface PersonaSummary {
  id: string;
  version: string;
  enabled: boolean;
  displayName: string;
  tagline: string;
  simulationDisclosure: string;
}

export interface PersonaManagerOptions {
  personasRoot: string;
}

const PERSONA_FILE_NAME = "persona.json";
const RESERVED_FOLDER_PREFIX = "_";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isInvalidJsonError(error: unknown): boolean {
  return error instanceof SyntaxError;
}

function createSummary(persona: Persona): PersonaSummary {
  return {
    id: persona.id,
    version: persona.version,
    enabled: persona.enabled,
    displayName: persona.basicInfo.displayName,
    tagline: persona.basicInfo.tagline,
    simulationDisclosure: persona.basicInfo.simulationDisclosure,
  };
}

export class PersonaManager {
  constructor(private readonly options: PersonaManagerOptions) {}

  async listPersonaIds(): Promise<string[]> {
    await this.assertPersonasRoot();
    const entries = await readdir(this.options.personasRoot, { withFileTypes: true });
    const ids: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(RESERVED_FOLDER_PREFIX)) {
        continue;
      }

      const personaFile = this.personaFilePath(entry.name);
      try {
        const fileStat = await stat(personaFile);
        if (fileStat.isFile()) {
          ids.push(entry.name);
        }
      } catch {
        continue;
      }
    }

    return ids.sort();
  }

  async listPersonas(): Promise<Persona[]> {
    const ids = await this.listPersonaIds();
    return Promise.all(ids.map((id) => this.getPersona(id)));
  }

  async listEnabledPersonas(): Promise<Persona[]> {
    const personas = await this.listPersonas();
    return personas.filter((persona) => persona.enabled);
  }

  async listPersonaSummaries(): Promise<PersonaSummary[]> {
    const personas = await this.listPersonas();
    return personas.map(createSummary);
  }

  async getPersona(personaId: string): Promise<Persona> {
    const normalizedId = this.normalizePersonaId(personaId);
    return this.loadPersonaFromFile(this.personaFilePath(normalizedId), normalizedId);
  }

  async loadPersonaFromFile(filePath: string, expectedId?: string): Promise<Persona> {
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new PersonaManagerError({
          code: "PERSONA_NOT_FOUND",
          message: expectedId
            ? `Persona "${expectedId}" was not found at ${filePath}.`
            : `Persona file was not found at ${filePath}.`,
          personaId: expectedId,
          filePath,
          cause: error,
        });
      }

      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      if (isInvalidJsonError(error)) {
        throw new PersonaManagerError({
          code: "PERSONA_JSON_INVALID",
          message: `Persona file at ${filePath} contains invalid JSON.`,
          personaId: expectedId,
          filePath,
          cause: error,
        });
      }

      throw error;
    }

    const persona = validatePersonaConfig(parsed, { filePath });
    const folderId = path.basename(path.dirname(filePath));
    const requiredId = expectedId ?? folderId;

    if (persona.id !== requiredId) {
      throw new PersonaManagerError({
        code: "PERSONA_ID_MISMATCH",
        message: `Persona id "${persona.id}" does not match folder "${requiredId}".`,
        personaId: requiredId,
        filePath,
        details: {
          configId: persona.id,
          folderId: requiredId,
        },
      });
    }

    return persona;
  }

  private personaFilePath(personaId: string): string {
    return path.join(this.options.personasRoot, personaId, PERSONA_FILE_NAME);
  }

  private normalizePersonaId(personaId: string): string {
    const normalized = personaId.trim();
    if (!normalized || normalized.includes("/") || normalized.includes("\\")) {
      throw new PersonaManagerError({
        code: "PERSONA_NOT_FOUND",
        message: `Persona id "${personaId}" is invalid.`,
        personaId,
      });
    }

    return normalized;
  }

  private async assertPersonasRoot(): Promise<void> {
    try {
      const rootStat = await stat(this.options.personasRoot);
      if (!rootStat.isDirectory()) {
        throw new PersonaManagerError({
          code: "INVALID_PERSONAS_ROOT",
          message: `Personas root "${this.options.personasRoot}" is not a directory.`,
          filePath: this.options.personasRoot,
        });
      }
    } catch (error) {
      if (error instanceof PersonaManagerError) {
        throw error;
      }

      if (isNotFoundError(error)) {
        throw new PersonaManagerError({
          code: "PERSONAS_ROOT_NOT_FOUND",
          message: `Personas root "${this.options.personasRoot}" does not exist.`,
          filePath: this.options.personasRoot,
          cause: error,
        });
      }

      throw error;
    }
  }
}
