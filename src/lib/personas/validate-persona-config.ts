import type { PersonaConfig } from "@/domain/personas/persona-config";

import {
  PersonaValidationError,
  type PersonaValidationIssue,
} from "./persona-errors";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addIssue(
  issues: PersonaValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ path, message });
}

function expectRecord(
  value: unknown,
  path: string,
  issues: PersonaValidationIssue[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return undefined;
  }

  return value;
}

function expectString(
  record: Record<string, unknown>,
  field: string,
  path: string,
  issues: PersonaValidationIssue[],
): void {
  const value = record[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    addIssue(issues, `${path}.${field}`, "must be a non-empty string");
  }
}

function expectOptionalStringValue(
  value: unknown,
  path: string,
  issues: PersonaValidationIssue[],
): void {
  if (value !== undefined && typeof value !== "string") {
    addIssue(issues, path, "must be a string when provided");
  }
}

function expectBoolean(
  record: Record<string, unknown>,
  field: string,
  path: string,
  issues: PersonaValidationIssue[],
): void {
  if (typeof record[field] !== "boolean") {
    addIssue(issues, `${path}.${field}`, "must be a boolean");
  }
}

function expectStringArray(
  record: Record<string, unknown>,
  field: string,
  path: string,
  issues: PersonaValidationIssue[],
): void {
  const value = record[field];
  if (!Array.isArray(value)) {
    addIssue(issues, `${path}.${field}`, "must be an array of strings");
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string") {
      addIssue(issues, `${path}.${field}[${index}]`, "must be a string");
    }
  });
}

function validateBasicInfo(
  value: unknown,
  issues: PersonaValidationIssue[],
): void {
  const record = expectRecord(value, "basicInfo", issues);
  if (!record) return;

  for (const field of [
    "displayName",
    "shortBio",
    "longBio",
    "avatarUrl",
    "tagline",
    "simulationDisclosure",
  ]) {
    expectOptionalStringValue(record[field], `basicInfo.${field}`, issues);
  }

  expectString(record, "displayName", "basicInfo", issues);
  expectString(record, "simulationDisclosure", "basicInfo", issues);
}

function validateLanguage(value: unknown, issues: PersonaValidationIssue[]): void {
  const record = expectRecord(value, "language", issues);
  if (!record) return;

  expectString(record, "primaryLanguage", "language", issues);
  expectStringArray(record, "secondaryLanguages", "language", issues);
  expectString(record, "formality", "language", issues);
  expectStringArray(record, "scriptPreferences", "language", issues);

  const codeSwitching = expectRecord(
    record.codeSwitching,
    "language.codeSwitching",
    issues,
  );
  if (codeSwitching) {
    expectBoolean(codeSwitching, "enabled", "language.codeSwitching", issues);
    expectOptionalStringValue(
      codeSwitching.description,
      "language.codeSwitching.description",
      issues,
    );
  }
}

function validateTeachingStyle(
  value: unknown,
  issues: PersonaValidationIssue[],
): void {
  const record = expectRecord(value, "teachingStyle", issues);
  if (!record) return;

  for (const field of ["approach", "explanationDepth", "pacing"]) {
    expectString(record, field, "teachingStyle", issues);
  }
  expectBoolean(record, "usesAnalogies", "teachingStyle", issues);
  expectBoolean(record, "checksUnderstanding", "teachingStyle", issues);
  expectStringArray(record, "analogySources", "teachingStyle", issues);
  expectStringArray(record, "structuresAnswersAs", "teachingStyle", issues);
}

function validateHumorStyle(value: unknown, issues: PersonaValidationIssue[]): void {
  const record = expectRecord(value, "humorStyle", issues);
  if (!record) return;

  expectStringArray(record, "humorTypes", "humorStyle", issues);
  expectString(record, "frequency", "humorStyle", issues);
  expectBoolean(record, "selfDeprecating", "humorStyle", issues);
  expectBoolean(record, "usesEmoji", "humorStyle", issues);
  expectStringArray(record, "boundaries", "humorStyle", issues);
}

function validateCommunicationStyle(
  value: unknown,
  issues: PersonaValidationIssue[],
): void {
  const record = expectRecord(value, "communicationStyle", issues);
  if (!record) return;

  for (const field of [
    "tone",
    "energyLevel",
    "sentenceLength",
    "directness",
    "addressesUserAs",
  ]) {
    expectString(record, field, "communicationStyle", issues);
  }
  expectStringArray(record, "formattingHabits", "communicationStyle", issues);
}

function validateGreetings(value: unknown, issues: PersonaValidationIssue[]): void {
  const record = expectRecord(value, "greetings", issues);
  if (!record) return;

  expectStringArray(record, "openers", "greetings", issues);
  expectStringArray(record, "returningUserOpeners", "greetings", issues);
  expectStringArray(record, "closers", "greetings", issues);
  expectOptionalStringValue(record.usageNotes, "greetings.usageNotes", issues);
}

function validateSignaturePhrases(
  value: unknown,
  issues: PersonaValidationIssue[],
): void {
  const record = expectRecord(value, "signaturePhrases", issues);
  if (!record) return;

  expectStringArray(record, "phrases", "signaturePhrases", issues);
  expectOptionalStringValue(
    record.usageNotes,
    "signaturePhrases.usageNotes",
    issues,
  );
}

function validateCommonWords(value: unknown, issues: PersonaValidationIssue[]): void {
  const record = expectRecord(value, "commonWords", issues);
  if (!record) return;

  expectStringArray(record, "words", "commonWords", issues);
  expectStringArray(record, "fillers", "commonWords", issues);
  expectStringArray(record, "avoidWords", "commonWords", issues);
}

function validateTechnicalDomains(
  value: unknown,
  issues: PersonaValidationIssue[],
): void {
  const record = expectRecord(value, "technicalDomains", issues);
  if (!record) return;

  expectOptionalStringValue(
    record.outOfScopeBehavior,
    "technicalDomains.outOfScopeBehavior",
    issues,
  );

  if (!Array.isArray(record.domains)) {
    addIssue(issues, "technicalDomains.domains", "must be an array");
    return;
  }

  record.domains.forEach((domain, index) => {
    const path = `technicalDomains.domains[${index}]`;
    const domainRecord = expectRecord(domain, path, issues);
    if (!domainRecord) return;

    expectString(domainRecord, "name", path, issues);
    expectString(domainRecord, "depth", path, issues);
    expectStringArray(domainRecord, "topics", path, issues);
  });
}

function validateFewShotExamples(
  value: unknown,
  issues: PersonaValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    addIssue(issues, "fewShotExamples", "must be an array");
    return;
  }

  value.forEach((example, index) => {
    const path = `fewShotExamples[${index}]`;
    const record = expectRecord(example, path, issues);
    if (!record) return;

    expectString(record, "user", path, issues);
    expectString(record, "assistant", path, issues);
    expectOptionalStringValue(record.notes, `${path}.notes`, issues);
  });
}

export function validatePersonaConfig(
  value: unknown,
  options: { filePath?: string } = {},
): PersonaConfig {
  const issues: PersonaValidationIssue[] = [];
  const root = expectRecord(value, "persona", issues);

  if (!root) {
    throw new PersonaValidationError(
      "Persona config must be a JSON object.",
      issues,
      options.filePath,
    );
  }

  expectString(root, "id", "persona", issues);
  expectString(root, "version", "persona", issues);
  expectBoolean(root, "enabled", "persona", issues);
  validateBasicInfo(root.basicInfo, issues);
  validateLanguage(root.language, issues);
  validateTeachingStyle(root.teachingStyle, issues);
  validateHumorStyle(root.humorStyle, issues);
  validateCommunicationStyle(root.communicationStyle, issues);
  validateGreetings(root.greetings, issues);
  validateSignaturePhrases(root.signaturePhrases, issues);
  validateCommonWords(root.commonWords, issues);
  validateTechnicalDomains(root.technicalDomains, issues);
  expectStringArray(root, "responseRules", "persona", issues);
  expectStringArray(root, "negativeRules", "persona", issues);
  validateFewShotExamples(root.fewShotExamples, issues);

  if (issues.length > 0) {
    const issueSummary = issues
      .slice(0, 5)
      .map((issue) => `${issue.path} ${issue.message}`)
      .join("; ");
    throw new PersonaValidationError(
      `Invalid persona config${options.filePath ? ` at ${options.filePath}` : ""}: ${issueSummary}`,
      issues,
      options.filePath,
    );
  }

  return root as unknown as PersonaConfig;
}
