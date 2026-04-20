import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCalcResult } from "../useCalcResult";
import { calcLLMRam } from "@/lib/calculator";
import { getCalcOptions } from "@/lib/calcInput";
import { KNOWN_MODELS } from "@/lib/models";
import type { CardData, HostingData, ModelSettings } from "@/lib/types";

// ─── Card builders ──────────────────────────────────────────────────────────

function buildHosting(overrides: Partial<HostingData> = {}): HostingData {
  return {
    price: "",
    gpuCount: "",
    gpuVram: "",
    gpuInfo: "",
    gpuBandwidth: "",
    cpuCores: "",
    cpuFreqGHz: "",
    cpuModel: "",
    ramBandwidthGBs: "",
    ramType: "",
    storageType: "",
    efficiency: "",
    notes: "",
    availableRam: "",
    availableStorage: "",
    osOverheadGb: 2,
    ...overrides,
  };
}

function buildModelSettings(
  overrides: Partial<ModelSettings> = {},
): ModelSettings {
  return {
    modelKey: "gemma2-9b",
    customModel: {
      name: "Custom",
      params: 7e9,
      layers: 32,
      kvHeads: 8,
      headDim: 128,
      moe: false,
    },
    quant: "q4_k_m",
    kvQuant: "bf16",
    contextK: 8,
    concurrentUsers: 1,
    kvCacheFillPct: 100,
    ...overrides,
  };
}

function buildCard(overrides: {
  model?: Partial<ModelSettings>;
  hosting?: Partial<HostingData>;
} = {}): CardData {
  return {
    id: "test",
    hfImportUrl: "",
    model: buildModelSettings(overrides.model),
    hosting: buildHosting(overrides.hosting),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("useCalcResult", () => {
  it("returns the documented fallback shape when the model key is unknown", () => {
    // The fallback exists so the UI doesn't crash when a stale URL points
    // at a deleted catalog entry. The exact shape matters because UI code
    // assumes osOverheadGb=2 and totalGb=2 in this state (no weights, no kv).
    const card = buildCard({ model: { modelKey: "no-such-model" } });
    const { result } = renderHook(() => useCalcResult(card));
    expect(result.current).toEqual({
      weightsGb: 0,
      kvCacheGb: 0,
      osOverheadGb: 2,
      totalGb: 2,
    });
  });

  it("matches calcLLMRam(getCalcOptions(...)) byte-for-byte for a known model", () => {
    // The hook is a thin memo wrapper. The point of this test is to catch
    // any silent transformation slipping in between (e.g. someone "rounding
    // for display" inside the hook would diverge from the underlying lib).
    const card = buildCard({
      model: { modelKey: "gemma2-9b", contextK: 8, quant: "q4_k_m" },
    });
    const { result } = renderHook(() => useCalcResult(card));
    const expected = calcLLMRam(
      getCalcOptions(card, KNOWN_MODELS["gemma2-9b"]!),
    );
    expect(result.current).toEqual(expected);
    // And sanity: it isn't the fallback shape.
    expect(result.current.weightsGb).toBeGreaterThan(0);
    expect(result.current.totalGb).toBeGreaterThan(2);
  });

  it("uses customModel (NOT a catalog model) when modelKey === 'custom'", () => {
    // Regression guard: at one point resolveModel could fall through to
    // KNOWN_MODELS['custom'] (undefined) and the hook would return the
    // fallback. We assert by reproducing the math from the custom config.
    const customModel = {
      name: "MyCustom",
      params: 1e9,
      layers: 16,
      kvHeads: 4,
      headDim: 128,
      moe: false,
    };
    const card = buildCard({ model: { modelKey: "custom", customModel } });
    const { result } = renderHook(() => useCalcResult(card));
    const expected = calcLLMRam(getCalcOptions(card, customModel));
    expect(result.current).toEqual(expected);
    // And it's not the fallback (fallback would have weightsGb===0).
    expect(result.current.weightsGb).toBeGreaterThan(0);
  });

  it("returns a stable reference when the same config object is passed across renders (memo works)", () => {
    // Memoization isn't a nice-to-have: downstream selectors and chart
    // memos depend on referential stability of the result object. If
    // useMemo's dependency array ever changes, charts re-render needlessly.
    const card = buildCard();
    const { result, rerender } = renderHook(({ c }) => useCalcResult(c), {
      initialProps: { c: card },
    });
    const first = result.current;
    rerender({ c: card });
    expect(result.current).toBe(first);
  });

  it("recomputes when context size changes (different totalGb)", () => {
    // KV cache scales linearly with context, so 8K vs 64K MUST give
    // different totals — if not, getCalcOptions isn't propagating contextK.
    const small = buildCard({ model: { contextK: 8 } });
    const large = buildCard({ model: { contextK: 64 } });
    const { result, rerender } = renderHook(({ c }) => useCalcResult(c), {
      initialProps: { c: small },
    });
    const smallTotal = result.current.totalGb;
    rerender({ c: large });
    const largeTotal = result.current.totalGb;
    expect(largeTotal).toBeGreaterThan(smallTotal);
  });

  it("recomputes weightsGb when quant changes (q8_0 > q4_k_m)", () => {
    const q4 = buildCard({ model: { quant: "q4_k_m" } });
    const q8 = buildCard({ model: { quant: "q8_0" } });
    const { result, rerender } = renderHook(({ c }) => useCalcResult(c), {
      initialProps: { c: q4 },
    });
    const w4 = result.current.weightsGb;
    rerender({ c: q8 });
    const w8 = result.current.weightsGb;
    // q8_0 is exactly 2× the bits of q4 so weights must roughly double.
    expect(w8).toBeGreaterThan(w4 * 1.5);
  });
});
