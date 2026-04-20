/**
 * UI-level scoring utilities: score normalization, color mapping, and TPS labels.
 * Pure math functions (calcLLMRam, calcDisk, calcValueScore, etc.) live in calculator.ts.
 */

/**
 * Normalize raw scores to 0-1 range using min-max scaling.
 * Returns array of normalized scores in same order as input.
 */
export function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return scores.map(() => 0.5);
  return scores.map((s) => (s - min) / (max - min));
}

/**
 * Get color from a normalized score (0-1 range) on a red→yellow→green gradient.
 */
export function getValueColor(normalized: number): string {
  // HSL interpolation: red (0°) → yellow (60°) → green (120°).
  // Saturation 65% (down from 85%) and lightness 45% are tuned to stay
  // legible on a white background without "vibrating" — 85%/50% reads as
  // an oversaturated bootstrap warning on light themes.
  const hue = normalized * 120;
  return `hsl(${hue}, 65%, 45%)`;
}

export interface TpsLabel {
  label: string;
  color: string;
}

/**
 * Get a qualitative speed label based on estimated TPS.
 * Useful for giving users an intuitive sense of how fast a config will feel.
 */
export function getTpsLabel(tps: number | null): TpsLabel | null {
  if (tps == null || tps <= 0) return null;
  if (tps < 1) return { label: "Very slow", color: "text-danger" };
  if (tps < 5) return { label: "Slow", color: "text-warning" };
  if (tps < 15) return { label: "Moderate", color: "text-warning" };
  if (tps < 30) return { label: "Good", color: "text-success" };
  return { label: "Fast", color: "text-success" };
}
