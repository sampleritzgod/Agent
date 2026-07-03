export type YouTubeCollectorErrorCode =
  | "INVALID_CHANNEL_URL"
  | "CHANNEL_NOT_FOUND"
  | "API_ERROR"
  | "CONFIG_ERROR";

/**
 * Typed error for the YouTube collector so callers can branch on `code`
 * instead of string-matching messages.
 */
export class YouTubeCollectorError extends Error {
  readonly code: YouTubeCollectorErrorCode;

  constructor(
    code: YouTubeCollectorErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "YouTubeCollectorError";
    this.code = code;
  }
}
