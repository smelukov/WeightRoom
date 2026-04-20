import type { CardData } from "./types";

export interface SavedState {
  mode: "single" | "compare";
  configs: CardData[];
}

export function encodeState(state: SavedState): string {
  try {
    const json = JSON.stringify(state);
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  } catch {
    return "";
  }
}

export function decodeState(encoded: string): SavedState | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
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
