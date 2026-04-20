import { useMemo } from "react";
import { calcValueScore } from "@/lib/calculator";
import { getValueScoreInput, resolveModel } from "@/lib/calcInput";
import type { CardData } from "@/lib/types";

export interface ValueScoreState {
  /** Estimated per-user tokens per second. Null when bandwidth data is unavailable. */
  tps: number | null;
  /** System-wide throughput (tps × concurrentUsers). Null when TPS cannot be calculated. */
  tpsSystem: number | null;
}

/**
 * Estimates per-user and system-wide TPS for the given card configuration.
 * Memoizes the result to avoid redundant recalculations on unrelated re-renders.
 * Returns null values when bandwidth information is not configured.
 *
 * Dependencies are the whole `config` object (see useCalcResult for the
 * rationale). calcValueScore is cheap enough that over-recomputing on
 * unrelated CardData changes is not a concern.
 */
export function useValueScore(config: CardData): ValueScoreState {
  return useMemo(() => {
    const model = resolveModel(config);
    if (!model) return { tps: null, tpsSystem: null };

    const result = calcValueScore(getValueScoreInput(config, model));

    return {
      tps: result?.tps ?? null,
      tpsSystem: result?.tpsSystem ?? null,
    };
  }, [config]);
}
