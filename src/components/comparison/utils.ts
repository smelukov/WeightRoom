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

/** Colors consistent with ResultCard breakdown. */
export const MC = {
  weights:   "#3b82f6", // blue-500
  kvCache:   "#a855f7", // purple-500
  osRam:     "#64748b", // slate-500
  modelFile: "#14b8a6", // teal-500
  diskOs:    "#475569", // slate-600
  tpsUser:   "#f59e0b", // amber-500
  tpsSys:    "#22c55e", // green-500
} as const;

export const emptyChartConfig = {} satisfies ChartConfig;
