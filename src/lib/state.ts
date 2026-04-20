import type { CardData } from "./types";

export interface SavedState {
  mode: "single" | "compare";
  configs: CardData[];
}

/** URL-safe base64 of a UTF-8 JSON payload. Pure helper, no validation. */
function toBase64Url(payload: unknown): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode a base64url string back into a UTF-8 string. Returns null on failure. */
function fromBase64Url(encoded: string): string | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeState(state: SavedState): string {
  try {
    return toBase64Url(state);
  } catch {
    return "";
  }
}

export function decodeState(encoded: string): SavedState | null {
  const json = fromBase64Url(encoded);
  if (json === null) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "configs" in parsed &&
      Array.isArray((parsed as SavedState).configs) &&
      (parsed as SavedState).configs.length > 0
    ) {
      return parsed as SavedState;
    }
  } catch {
    // Gracefully handle malformed/legacy encoded strings
  }
  return null;
}

/**
 * Serialise a single `CardData` for the embed widget URL (`?s=` on
 * `embed.html`). We use the same base64url-of-JSON encoding as `encodeState`
 * for consistency, but skip the `{mode, configs[]}` envelope — the embed
 * always shows exactly one card, so the array wrapper would only inflate the
 * URL with no payoff. Returns an empty string on encoder failure (mirrors
 * `encodeState`'s contract so callers can treat both the same way).
 */
export function encodeStateForEmbed(card: CardData): string {
  try {
    return toBase64Url(card);
  } catch {
    return "";
  }
}

/**
 * Inverse of `encodeStateForEmbed`. Returns `null` on malformed input or when
 * the decoded payload is missing the minimum fields needed to render a card
 * (`id`, `model`, `hosting`). The returned object is trusted by the embed
 * renderer; we deliberately don't deep-validate every nested field — the
 * calculator falls back to safe defaults for any missing inner value.
 */
export function decodeStateForEmbed(encoded: string): CardData | null {
  const json = fromBase64Url(encoded);
  if (json === null) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "id" in parsed &&
      "model" in parsed &&
      "hosting" in parsed
    ) {
      return parsed as CardData;
    }
  } catch {
    // Malformed JSON or legacy payload — caller will render a fallback.
  }
  return null;
}
