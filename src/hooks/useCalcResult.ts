import { useMemo } from "react";
import { calcLLMRam } from "@/lib/calculator";
import { getCalcOptions, resolveModel } from "@/lib/calcInput";
import type { CardData, CalcResult } from "@/lib/types";

/**
 * Calculates RAM requirements for the given card configuration.
 * Memoizes the result to avoid redundant recalculations on unrelated re-renders.
 *
 * Dependencies are intentionally the whole `config` object: this matches the
 * automatic inference performed by React Compiler / eslint-plugin-react-hooks
 * and keeps the memoization in lock-step with the fields actually consumed by
 * `getCalcOptions`. calcLLMRam itself is microsecond-cheap, so the slight
 * over-recomputation on unrelated CardData changes is not a concern.
 */
export function useCalcResult(config: CardData): CalcResult {
  return useMemo(() => {
    const model = resolveModel(config);
    if (!model) {
      return { weightsGb: 0, kvCacheGb: 0, osOverheadGb: 2, totalGb: 2 };
    }
    return calcLLMRam(getCalcOptions(config, model));
  }, [config]);
}
