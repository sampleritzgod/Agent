/**
 * A normalized reference to a channel, derived from a user-supplied URL.
 *
 * YouTube exposes several URL shapes that resolve differently against the Data
 * API, so we classify them up front:
 *  - `id`       → /channel/UC...            (direct channel id)
 *  - `handle`   → /@handle                  (modern @handle)
 *  - `username` → /user/name                (legacy username)
 *  - `custom`   → /c/name  (or bare slug)   (legacy custom URL, needs search)
 */
export type ChannelRef =
  | { kind: "id"; value: string }
  | { kind: "handle"; value: string }
  | { kind: "username"; value: string }
  | { kind: "custom"; value: string };

const CHANNEL_ID_PATTERN = /^UC[0-9A-Za-z_-]{22}$/;

function normalizeHandle(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

/**
 * Parse a channel URL (or bare handle / id) into a {@link ChannelRef}.
 *
 * Accepted inputs include:
 *   https://www.youtube.com/@chaiaurcode
 *   https://youtube.com/channel/UCXXXXXXXXXXXXXXXXXXXXXX
 *   https://www.youtube.com/user/someUser
 *   https://www.youtube.com/c/SomeCustomName
 *   @chaiaurcode
 *   UCXXXXXXXXXXXXXXXXXXXXXX
 */
export function parseChannelUrl(rawInput: string): ChannelRef {
  const input = rawInput.trim();
  if (!input) {
    throw new Error("Channel URL must not be empty.");
  }

  // Bare inputs that are not URLs: `@handle` or a raw channel id.
  if (!/^https?:\/\//i.test(input)) {
    if (input.startsWith("@")) {
      return { kind: "handle", value: normalizeHandle(input) };
    }
    if (CHANNEL_ID_PATTERN.test(input)) {
      return { kind: "id", value: input };
    }
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://www.youtube.com/${input}`);
  } catch (cause) {
    throw new Error(`Could not parse channel URL: ${input}`, { cause });
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtu.be") {
    throw new Error(`Not a YouTube URL: ${input}`);
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error(`URL does not point at a channel: ${input}`);
  }

  const [first, second] = segments;

  if (first.startsWith("@")) {
    return { kind: "handle", value: normalizeHandle(first) };
  }

  switch (first) {
    case "channel":
      if (!second || !CHANNEL_ID_PATTERN.test(second)) {
        throw new Error(`Invalid channel id in URL: ${input}`);
      }
      return { kind: "id", value: second };
    case "user":
      if (!second) {
        throw new Error(`Missing username in URL: ${input}`);
      }
      return { kind: "username", value: second };
    case "c":
      if (!second) {
        throw new Error(`Missing custom name in URL: ${input}`);
      }
      return { kind: "custom", value: second };
    default:
      // A single-segment legacy custom URL, e.g. youtube.com/SomeName
      return { kind: "custom", value: first };
  }
}
