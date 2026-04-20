/**
 * Custom shields.io-style badge generator.
 *
 * Why we don't use html-to-image / `toSvg` for these:
 * `toSvg` wraps the captured DOM in a `<foreignObject>`, which GitHub README
 * sometimes refuses to render (anti-XSS policy). A handwritten SVG is also
 * 5–10× smaller (~600 bytes vs ~6 KB) and stays crisp at any zoom because
 * there's no rasterised glyph data — just `<text>` nodes.
 *
 * Keep this file dependency-free: it must be cheap to import from anywhere.
 */

import { calcLLMRam, calcValueScore } from "@/lib/calculator";
import {
  resolveModel,
  getCalcOptions,
  getValueScoreInput,
} from "@/lib/calcInput";
import { KNOWN_MODELS } from "@/lib/models";
import type { CardData } from "@/lib/types";

export type ShieldTheme = "auto" | "light" | "dark";

/** What metric the right-hand value displays. */
export type ShieldMetric = "tps" | "ram" | "summary";

export interface ShieldOptions {
  /** Left-hand label. Defaults to "WeightRoom". */
  label?: string;
  /** Which metric to surface in the value side. Defaults to "summary". */
  metric?: ShieldMetric;
  /** Colour scheme. `auto` uses CSS `currentColor`, adapting to the host. */
  theme?: ShieldTheme;
}

interface ResolvedColors {
  labelBg: string;
  valueBg: string;
  labelText: string;
  valueText: string;
  /**
   * Opacity of the 1-pixel drop-shadow doubled under each text node.
   * On dark backgrounds the shadow (#010101) emboss-effect reads cleanly;
   * on light backgrounds it produces a muddy double-stroke, so we drop it
   * to 0 (or near-0) to keep the text crisp.
   */
  labelShadowOpacity: number;
  valueShadowOpacity: number;
}

/**
 * Themes pick visibly different chrome so a user toggling Light ↔ Dark in
 * the share dialog sees a real change, not just a tint.
 *
 * - Light: pale label + saturated brand value (#7c3aed). Reads great on a
 *   white README and looks like a "designed" badge, not a grey block.
 * - Dark: near-black label + soft lavender value (#a78bfa) with dark text.
 *   The dark variant deliberately uses the lighter shade of purple so the
 *   value cell has enough contrast against the chrome.
 */
const PALETTES: Record<Exclude<ShieldTheme, "auto">, ResolvedColors> = {
  light: {
    labelBg: "#f5f5f5",
    valueBg: "#7c3aed",
    labelText: "#1a1a1a",
    valueText: "#ffffff",
    labelShadowOpacity: 0,
    valueShadowOpacity: 0.3,
  },
  dark: {
    labelBg: "#1f1f1f",
    valueBg: "#a78bfa",
    labelText: "#fafafa",
    valueText: "#0a0a0a",
    labelShadowOpacity: 0.3,
    valueShadowOpacity: 0,
  },
};

// ─── Text width estimation ───────────────────────────────────────────────────
// shields.io uses pixel-perfect Verdana metrics tables. For our purposes a
// monospaced approximation is good enough: pick a per-character width that
// makes typical labels (RAM 56GB · 171 t/s) line up cleanly without overflow.
// If the badge ever looks too tight, tweak `AVG_CHAR_WIDTH` here rather than
// switching to a runtime canvas measurement (which adds startup cost).
const AVG_CHAR_WIDTH = 6.4; // px per glyph at 11px font size (Verdana-ish)
const PADDING_X = 7;
const HEIGHT = 20;

function measure(text: string): number {
  // Round up so we always reserve a hair more space than strictly needed.
  return Math.ceil(text.length * AVG_CHAR_WIDTH);
}

/** Escape XML special characters in user-controlled label/value strings. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatTps(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  }
  if (value >= 100) return Math.round(value).toString();
  return value.toFixed(1);
}

function getModelSlug(card: CardData): string {
  if (card.model.modelKey !== "custom") {
    const known = KNOWN_MODELS[card.model.modelKey];
    if (known) return known.displayName;
  }
  return card.model.customModel.name ?? "Custom";
}

/** Compute the value-side text for a given metric choice. */
function computeValueText(card: CardData, metric: ShieldMetric): string {
  const model = resolveModel(card);
  if (!model) return getModelSlug(card);

  const ram = calcLLMRam(getCalcOptions(card, model));
  const score = calcValueScore(getValueScoreInput(card, model));
  const tps = score?.tps ?? null;
  const slug = getModelSlug(card);

  switch (metric) {
    case "tps":
      return tps !== null ? `${slug} | ${formatTps(tps)} t/s` : slug;
    case "ram":
      return `${slug} | ${ram.totalGb} GB`;
    case "summary":
    default: {
      const tpsStr = tps !== null ? ` | ${formatTps(tps)} t/s` : "";
      return `${slug} | ${ram.totalGb} GB${tpsStr}`;
    }
  }
}

/**
 * Render a shields.io-style SVG badge for the given card configuration.
 * Returns a complete `<svg>…</svg>` string ready to be saved, base64-encoded
 * for a data URL, or copied into a Markdown file.
 *
 * The output is XML-safe and self-contained (no external font / CSS refs).
 * The `auto` theme uses `currentColor` so the value text adapts to the host
 * page's foreground colour — handy in GitHub READMEs that switch dark/light.
 */
export function renderShieldSvg(
  card: CardData,
  options: ShieldOptions = {},
): string {
  const label = options.label ?? "WeightRoom";
  const metric = options.metric ?? "summary";
  const theme = options.theme ?? "auto";
  const value = computeValueText(card, metric);

  const labelW = measure(label) + PADDING_X * 2;
  const valueW = measure(value) + PADDING_X * 2;
  const totalW = labelW + valueW;

  // currentColor lets GitHub's README dark/light theme repaint the value side
  // automatically. For `light` / `dark` we hard-code colours (predictable on
  // forums or PDFs that don't honour CSS context).
  const colors: ResolvedColors =
    theme === "auto"
      ? {
          labelBg: "#555555",
          valueBg: "transparent",
          labelText: "#ffffff",
          valueText: "currentColor",
          labelShadowOpacity: 0.3,
          // Skip shadow on the value side: with a transparent background and
          // currentColor text, an extra dark stroke would muddy the result on
          // a light README.
          valueShadowOpacity: 0,
        }
      : PALETTES[theme];

  const labelEsc = escapeXml(label);
  const valueEsc = escapeXml(value);
  const titleAttr = `${labelEsc}: ${valueEsc}`;

  // Drop-shadow under text mimics shields.io's classic look. Two text nodes
  // (one black at 1px offset, one in the foreground colour) produce the
  // 1-pixel emboss without needing an SVG <filter>. We emit each shadow node
  // only when its opacity is > 0 so the Light theme's pale label doesn't get
  // a muddy double-stroke.
  const labelShadow =
    colors.labelShadowOpacity > 0
      ? `<text x="${labelW / 2}" y="15" fill="#010101" fill-opacity="${colors.labelShadowOpacity}">${labelEsc}</text>`
      : "";
  const valueShadow =
    colors.valueShadowOpacity > 0
      ? `<text x="${labelW + valueW / 2}" y="15" fill="#010101" fill-opacity="${colors.valueShadowOpacity}">${valueEsc}</text>`
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${HEIGHT}" role="img" aria-label="${titleAttr}">
  <title>${titleAttr}</title>
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="a"><rect width="${totalW}" height="${HEIGHT}" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#a)">
    <rect width="${labelW}" height="${HEIGHT}" fill="${colors.labelBg}"/>
    <rect x="${labelW}" width="${valueW}" height="${HEIGHT}" fill="${colors.valueBg}"/>
    <rect width="${totalW}" height="${HEIGHT}" fill="url(#b)"/>
  </g>
  <g fill="${colors.labelText}" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    ${labelShadow}
    <text x="${labelW / 2}" y="14">${labelEsc}</text>
    ${valueShadow}
    <text x="${labelW + valueW / 2}" y="14" fill="${colors.valueText}">${valueEsc}</text>
  </g>
</svg>`;
}

/**
 * Convenience: encode the SVG as a base64 data URL ready for `<img src="…">`.
 * Browser-only (uses `btoa`) — in tests under jsdom this is also available.
 * base64 keeps the URL stable when copied into Markdown editors that mangle
 * raw `<` / `>`, and most parsers consume it more reliably than the
 * percent-encoded alternative.
 */
export function shieldSvgToDataUrl(svg: string): string {
  const b64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${b64}`;
}
