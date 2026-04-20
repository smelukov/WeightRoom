/**
 * Declarative metadata for every share-card format the user can download.
 *
 * Adding a new format = adding one entry here + a branch in ShareCard.tsx.
 * Sizes are intentionally fixed (not responsive): the UI renders a scaled
 * preview, but the captured PNG/SVG always matches the canonical pixel
 * dimensions so platforms (Twitter, LinkedIn, Instagram) don't re-scale and
 * blur the result.
 */
export type ShareFormatId =
  | "og"
  | "square"
  | "story"
  | "card-badge"
  | "shield";

export type ShareCategory = "social" | "readme";
export type ShareFileFormat = "png" | "svg";

export interface ShareFormat {
  id: ShareFormatId;
  /** UI label, also used in the filename. */
  label: string;
  /** Short hint shown under the picker — what platform / context this is for. */
  description: string;
  /** Logical canvas size in CSS pixels (HTML target before pixelRatio). */
  width: number;
  height: number;
  category: ShareCategory;
  /**
   * File formats this template supports. Order matters — the first entry is
   * the default selection in the UI.
   */
  fileFormats: readonly ShareFileFormat[];
  /** Whether this format renders a QR-code by default (large surfaces only). */
  defaultIncludeQr: boolean;
  /** Whether the QR-code toggle is exposed at all in the UI. */
  qrToggleVisible: boolean;
}

/**
 * Source of truth for share formats. Sorted by category for the UI's segmented
 * control: socials first (most common), then README artefacts.
 */
export const SHARE_FORMATS: readonly ShareFormat[] = [
  {
    id: "og",
    label: "Twitter / LinkedIn (1200×630)",
    description: "Open Graph card for X, LinkedIn, Facebook posts",
    width: 1200,
    height: 630,
    category: "social",
    fileFormats: ["png"],
    defaultIncludeQr: false,
    qrToggleVisible: true,
  },
  {
    id: "square",
    label: "Square (1080×1080)",
    description: "Instagram feed, LinkedIn carousel slide",
    width: 1080,
    height: 1080,
    category: "social",
    fileFormats: ["png"],
    defaultIncludeQr: true,
    qrToggleVisible: true,
  },
  {
    id: "story",
    label: "Story (1080×1920)",
    description: "Instagram / TikTok stories, vertical 9:16",
    width: 1080,
    height: 1920,
    category: "social",
    fileFormats: ["png"],
    defaultIncludeQr: true,
    qrToggleVisible: true,
  },
  {
    id: "card-badge",
    label: "Card badge (600×140)",
    description: "README hero block, recognisable WeightRoom branding",
    width: 600,
    height: 140,
    category: "readme",
    fileFormats: ["png", "svg"],
    defaultIncludeQr: false,
    qrToggleVisible: false,
  },
  {
    id: "shield",
    label: "Shield (~480×30)",
    description: "shields.io-style badge, sits next to other README badges",
    // Width is computed dynamically from label/value text length; these are
    // rough upper-bound hints used only for preview sizing in the UI.
    width: 480,
    height: 30,
    category: "readme",
    fileFormats: ["svg"],
    defaultIncludeQr: false,
    qrToggleVisible: false,
  },
] as const;

/** Look up a format by id. Returns null on unknown id. */
export function getShareFormat(id: ShareFormatId): ShareFormat | null {
  return SHARE_FORMATS.find((f) => f.id === id) ?? null;
}

/** All formats grouped by category, in declaration order. */
export function getShareFormatsByCategory(
  category: ShareCategory,
): ShareFormat[] {
  return SHARE_FORMATS.filter((f) => f.category === category);
}
