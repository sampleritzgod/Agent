export interface PersonaBasicInfo {
  displayName: string;
  shortBio: string;
  longBio: string;
  avatarUrl: string;
  tagline: string;
  simulationDisclosure: string;
}

export interface PersonaLanguage {
  primaryLanguage: string;
  secondaryLanguages: string[];
  codeSwitching: {
    enabled: boolean;
    description: string;
  };
  formality: string;
  scriptPreferences: string[];
}

export interface PersonaTeachingStyle {
  approach: string;
  explanationDepth: string;
  usesAnalogies: boolean;
  analogySources: string[];
  structuresAnswersAs: string[];
  checksUnderstanding: boolean;
  pacing: string;
}

export interface PersonaHumorStyle {
  humorTypes: string[];
  frequency: string;
  selfDeprecating: boolean;
  usesEmoji: boolean;
  boundaries: string[];
}

export interface PersonaCommunicationStyle {
  tone: string;
  energyLevel: string;
  sentenceLength: string;
  directness: string;
  formattingHabits: string[];
  addressesUserAs: string;
}

export interface PersonaGreetings {
  openers: string[];
  returningUserOpeners: string[];
  closers: string[];
  usageNotes: string;
}

export interface PersonaSignaturePhrases {
  phrases: string[];
  usageNotes: string;
}

export interface PersonaCommonWords {
  words: string[];
  fillers: string[];
  avoidWords: string[];
}

export interface PersonaTechnicalDomain {
  name: string;
  depth: string;
  topics: string[];
}

export interface PersonaTechnicalDomains {
  domains: PersonaTechnicalDomain[];
  outOfScopeBehavior: string;
}

export interface PersonaFewShotExample {
  user: string;
  assistant: string;
  notes: string;
}

export interface PersonaConfig {
  id: string;
  version: string;
  enabled: boolean;
  basicInfo: PersonaBasicInfo;
  language: PersonaLanguage;
  teachingStyle: PersonaTeachingStyle;
  humorStyle: PersonaHumorStyle;
  communicationStyle: PersonaCommunicationStyle;
  greetings: PersonaGreetings;
  signaturePhrases: PersonaSignaturePhrases;
  commonWords: PersonaCommonWords;
  technicalDomains: PersonaTechnicalDomains;
  responseRules: string[];
  negativeRules: string[];
  fewShotExamples: PersonaFewShotExample[];
}

export interface RetrievedTranscriptChunk {
  text: string;
  sourceTitle?: string;
  sourceUrl?: string;
  publishedAt?: string;
}

export interface PersonaPromptContext {
  retrievedTranscriptChunks?: Array<string | RetrievedTranscriptChunk>;
  previousConversationSummary?: string;
  currentUserMessage?: string;
  /**
   * Backward-compatible alias for retrieved transcript/context text.
   * Prefer `retrievedTranscriptChunks` for new chat flows.
   */
  retrievedContext?: string;
  /**
   * Backward-compatible alias for previous conversation state.
   * Prefer `previousConversationSummary` for new chat flows.
   */
  conversationMemory?: string;
}
