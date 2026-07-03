/**
 * Strongly typed persona profile produced by the Persona Analyzer.
 *
 * `PersonaAnalysis` is exactly what the model returns (the 20 communication-style
 * attributes). `Persona` is that analysis plus the metadata the analyzer stamps
 * on it locally. Everything lives in this feature folder — no separate domain
 * layer needed.
 */

export type SentenceLength = "short" | "medium" | "long" | "mixed";

export type ConfidenceLevel =
  | "reserved"
  | "balanced"
  | "confident"
  | "highly-confident";

export type TechnicalDepth = "surface" | "moderate" | "deep" | "mixed";

export type AudienceLevel = "beginner" | "intermediate" | "advanced" | "mixed";

export interface LanguageDistribution {
  /** Approximate share of Hindi (0-100). */
  hindiPercentage: number;
  /** Approximate share of English (0-100). */
  englishPercentage: number;
  /** How the two are mixed in practice (e.g. Hinglish code-switching habits). */
  codeSwitching: string;
}

/** The 20 communication-style attributes extracted from transcripts. */
export interface PersonaAnalysis {
  greetingPatterns: string[];
  languageDistribution: LanguageDistribution;
  technicalVocabulary: string[];
  teachingMethodology: string;
  explanationFlow: string;
  humorStyle: string;
  commonJokes: string[];
  signaturePhrases: string[];
  transitionWords: string[];
  sentenceLength: SentenceLength;
  sentenceLengthNotes: string;
  confidenceLevel: ConfidenceLevel;
  audienceInteractionStyle: string;
  storytellingPatterns: string;
  analogyUsage: string;
  technicalDepth: TechnicalDepth;
  audienceLevel: AudienceLevel;
  closingStyle: string[];
  avoids: string[];
  formattingHabits: string[];
  communicationSummary: string;
}

export interface Persona extends PersonaAnalysis {
  /** Creator name/handle, if the caller supplied one. */
  creator: string;
  /** ISO 8601 timestamp of when the profile was generated. */
  generatedAt: string;
  /** OpenAI model used for the analysis. */
  model: string;
  /** How many transcript chunks the analysis was based on. */
  sourceChunkCount: number;
}

const SENTENCE_LENGTHS: SentenceLength[] = ["short", "medium", "long", "mixed"];
const CONFIDENCE_LEVELS: ConfidenceLevel[] = [
  "reserved",
  "balanced",
  "confident",
  "highly-confident",
];
const TECHNICAL_DEPTHS: TechnicalDepth[] = ["surface", "moderate", "deep", "mixed"];
const AUDIENCE_LEVELS: AudienceLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
  "mixed",
];

/**
 * JSON Schema handed to the OpenAI Structured Outputs API. `strict` mode requires
 * every property to be listed in `required` and `additionalProperties: false`, so
 * this schema mirrors {@link PersonaAnalysis} exactly.
 */
export const PERSONA_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    greetingPatterns: { type: "array", items: { type: "string" } },
    languageDistribution: {
      type: "object",
      additionalProperties: false,
      properties: {
        hindiPercentage: { type: "number" },
        englishPercentage: { type: "number" },
        codeSwitching: { type: "string" },
      },
      required: ["hindiPercentage", "englishPercentage", "codeSwitching"],
    },
    technicalVocabulary: { type: "array", items: { type: "string" } },
    teachingMethodology: { type: "string" },
    explanationFlow: { type: "string" },
    humorStyle: { type: "string" },
    commonJokes: { type: "array", items: { type: "string" } },
    signaturePhrases: { type: "array", items: { type: "string" } },
    transitionWords: { type: "array", items: { type: "string" } },
    sentenceLength: { type: "string", enum: SENTENCE_LENGTHS },
    sentenceLengthNotes: { type: "string" },
    confidenceLevel: { type: "string", enum: CONFIDENCE_LEVELS },
    audienceInteractionStyle: { type: "string" },
    storytellingPatterns: { type: "string" },
    analogyUsage: { type: "string" },
    technicalDepth: { type: "string", enum: TECHNICAL_DEPTHS },
    audienceLevel: { type: "string", enum: AUDIENCE_LEVELS },
    closingStyle: { type: "array", items: { type: "string" } },
    avoids: { type: "array", items: { type: "string" } },
    formattingHabits: { type: "array", items: { type: "string" } },
    communicationSummary: { type: "string" },
  },
  required: [
    "greetingPatterns",
    "languageDistribution",
    "technicalVocabulary",
    "teachingMethodology",
    "explanationFlow",
    "humorStyle",
    "commonJokes",
    "signaturePhrases",
    "transitionWords",
    "sentenceLength",
    "sentenceLengthNotes",
    "confidenceLevel",
    "audienceInteractionStyle",
    "storytellingPatterns",
    "analogyUsage",
    "technicalDepth",
    "audienceLevel",
    "closingStyle",
    "avoids",
    "formattingHabits",
    "communicationSummary",
  ],
} as const;

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function toStr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNum(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Defensively coerce the model's JSON into a {@link PersonaAnalysis}. Structured
 * Outputs already guarantees the shape, but this keeps the analyzer robust to any
 * drift and gives us a single, predictable object downstream.
 */
export function parsePersonaAnalysis(raw: unknown): PersonaAnalysis {
  const data = (raw ?? {}) as Record<string, unknown>;
  const lang = (data.languageDistribution ?? {}) as Record<string, unknown>;

  return {
    greetingPatterns: toStringArray(data.greetingPatterns),
    languageDistribution: {
      hindiPercentage: toNum(lang.hindiPercentage),
      englishPercentage: toNum(lang.englishPercentage),
      codeSwitching: toStr(lang.codeSwitching),
    },
    technicalVocabulary: toStringArray(data.technicalVocabulary),
    teachingMethodology: toStr(data.teachingMethodology),
    explanationFlow: toStr(data.explanationFlow),
    humorStyle: toStr(data.humorStyle),
    commonJokes: toStringArray(data.commonJokes),
    signaturePhrases: toStringArray(data.signaturePhrases),
    transitionWords: toStringArray(data.transitionWords),
    sentenceLength: toEnum(data.sentenceLength, SENTENCE_LENGTHS, "mixed"),
    sentenceLengthNotes: toStr(data.sentenceLengthNotes),
    confidenceLevel: toEnum(data.confidenceLevel, CONFIDENCE_LEVELS, "balanced"),
    audienceInteractionStyle: toStr(data.audienceInteractionStyle),
    storytellingPatterns: toStr(data.storytellingPatterns),
    analogyUsage: toStr(data.analogyUsage),
    technicalDepth: toEnum(data.technicalDepth, TECHNICAL_DEPTHS, "moderate"),
    audienceLevel: toEnum(data.audienceLevel, AUDIENCE_LEVELS, "mixed"),
    closingStyle: toStringArray(data.closingStyle),
    avoids: toStringArray(data.avoids),
    formattingHabits: toStringArray(data.formattingHabits),
    communicationSummary: toStr(data.communicationSummary),
  };
}
