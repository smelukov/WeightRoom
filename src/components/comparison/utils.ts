import type { ChartConfig } from "@/components/ui/chart";
import { calcValueScore } from "@/lib/calculator";
import { getValueScoreInput, resolveModel } from "@/lib/calcInput";
import { KNOWN_MODELS } from "@/lib/models";
import type { CardData } from "@/lib/types";

export function getConfigLabel(c: CardData, index: number): string {
  if (c.model.modelKey === "custom")
    return c.model.customModel.name || `Config ${index + 1}`;
  return KNOWN_MODELS[c.model.modelKey]?.displayName ?? c.model.modelKey;
}

/** Calculate raw value score for a CardData. Returns 0 if data is insufficient. */
export function getRawValueScore(c: CardData): number {
  const model = resolveModel(c);
  if (!model) return 0;
  const result = calcValueScore(getValueScoreInput(c, model));
  return result?.rawScore ?? 0;
}

/** Calculate per-user TPS for a CardData. Returns null if data is insufficient. */
export function getTps(c: CardData): number | null {
  const model = resolveModel(c);
  if (!model) return null;
  const result = calcValueScore(getValueScoreInput(c, model));
  return result?.tps ?? null;
}

/** Calculate system-wide TPS for a CardData. Returns null if data is insufficient. */
export function getTpsSystem(c: CardData): number | null {
  const model = resolveModel(c);
  if (!model) return null;
  const result = calcValueScore(getValueScoreInput(c, model));
  return result?.tpsSystem ?? null;
}

/**
 * Theme-aware colours for the comparison charts. Recharts requires a CSS
 * value (string), not a Tailwind classname, so we point each role at the
 * same `--color-chart-N` / status tokens that `ResultCard` uses for its
 * stacked bars. Both light and dark themes provide values for every var,
 * so swapping the theme automatically re-tints the charts.
 */
export const MC = {
  weights:   "var(--color-chart-1)",
  kvCache:   "var(--color-chart-2)",
  osRam:     "var(--color-chart-3)",
  modelFile: "var(--color-chart-4)",
  diskOs:    "var(--color-chart-3)",
  tpsUser:   "var(--color-warning)",
  tpsSys:    "var(--color-success)",
} as const;

export const emptyChartConfig = {} satisfies ChartConfig;
