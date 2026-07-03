import type { PersonaConfig } from "@/domain/personas/persona-config";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validatePersonaConfig(value: unknown): PersonaConfig {
  if (!isRecord(value)) {
    throw new Error("Persona config must be a JSON object.");
  }

  const requiredStringFields = ["id", "version"] as const;
  for (const field of requiredStringFields) {
    if (typeof value[field] !== "string" || value[field].length === 0) {
      throw new Error(`Persona config field "${field}" must be a non-empty string.`);
    }
  }

  if (typeof value.enabled !== "boolean") {
    throw new Error('Persona config field "enabled" must be a boolean.');
  }

  const requiredObjects = [
    "basicInfo",
    "language",
    "teachingStyle",
    "humorStyle",
    "communicationStyle",
    "greetings",
    "signaturePhrases",
    "commonWords",
    "technicalDomains",
  ] as const;

  for (const field of requiredObjects) {
    if (!isRecord(value[field])) {
      throw new Error(`Persona config field "${field}" must be an object.`);
    }
  }

  if (!isStringArray(value.responseRules)) {
    throw new Error('Persona config field "responseRules" must be a string array.');
  }

  if (!isStringArray(value.negativeRules)) {
    throw new Error('Persona config field "negativeRules" must be a string array.');
  }

  if (!Array.isArray(value.fewShotExamples)) {
    throw new Error('Persona config field "fewShotExamples" must be an array.');
  }

  return value as unknown as PersonaConfig;
}
