export type PersonaManagerErrorCode =
  | "PERSONAS_ROOT_NOT_FOUND"
  | "INVALID_PERSONAS_ROOT"
  | "PERSONA_NOT_FOUND"
  | "PERSONA_JSON_INVALID"
  | "PERSONA_CONFIG_INVALID"
  | "PERSONA_ID_MISMATCH";

export interface PersonaManagerErrorOptions {
  code: PersonaManagerErrorCode;
  message: string;
  personaId?: string;
  filePath?: string;
  details?: unknown;
  cause?: unknown;
}

export class PersonaManagerError extends Error {
  readonly code: PersonaManagerErrorCode;
  readonly personaId?: string;
  readonly filePath?: string;
  readonly details?: unknown;

  constructor(options: PersonaManagerErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "PersonaManagerError";
    this.code = options.code;
    this.personaId = options.personaId;
    this.filePath = options.filePath;
    this.details = options.details;
  }
}

export interface PersonaValidationIssue {
  path: string;
  message: string;
}

export class PersonaValidationError extends PersonaManagerError {
  readonly issues: PersonaValidationIssue[];

  constructor(message: string, issues: PersonaValidationIssue[], filePath?: string) {
    super({
      code: "PERSONA_CONFIG_INVALID",
      message,
      filePath,
      details: { issues },
    });
    this.name = "PersonaValidationError";
    this.issues = issues;
  }
}
