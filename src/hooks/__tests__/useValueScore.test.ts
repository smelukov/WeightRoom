import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useValueScore } from "../useValueScore";
import { calcValueScore } from "@/lib/calculator";
import { getValueScoreInput } from "@/lib/calcInput";
import { KNOWN_MODELS } from "@/lib/models";
import type { CardData, HostingData, ModelSettings } from "@/lib/types";

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

describe("useValueScore", () => {
  it("returns null/null when bandwidth fields are blank (calcValueScore can't compute TPS)", () => {
    // The whole point of useValueScore returning nullable values is so the
    // UI can show a placeholder before the user fills in hosting data.
    // If this regresses to 0 instead of null, the placeholder UX breaks.
    const card = buildCard();
    const { result } = renderHook(() => useValueScore(card));
    expect(result.current).toEqual({ tps: null, tpsSystem: null });
  });

  it("returns null/null when the model key is unknown", () => {
    const card = buildCard({
      model: { modelKey: "no-such-model" },
      hosting: { gpuCount: "1", gpuBandwidth: "1500" },
    });
    const { result } = renderHook(() => useValueScore(card));
    expect(result.current.tps).toBeNull();
    expect(result.current.tpsSystem).toBeNull();
  });

  it("matches calcValueScore output (tps and tpsSystem) when bandwidth is configured", () => {
    const card = buildCard({
      hosting: { gpuCount: "1", gpuBandwidth: "1500", efficiency: "80" },
    });
    const { result } = renderHook(() => useValueScore(card));
    const expected = calcValueScore(
      getValueScoreInput(card, KNOWN_MODELS["gemma2-9b"]!),
    );
    if (!expected || expected.tps === null || expected.tpsSystem === null) {
      throw new Error("expected calcValueScore to return numeric tps fields");
    }
    expect(result.current.tps).toBeCloseTo(expected.tps, 6);
    expect(result.current.tpsSystem).toBeCloseTo(expected.tpsSystem, 6);
    expect(result.current.tps).toBeGreaterThan(0);
  });

  it("system TPS scales with concurrentUsers (load-test invariant)", () => {
    // tpsSystem MUST grow with concurrentUsers — if it doesn't, the
    // throughput chart would be wrong for any multi-user deployment.
    const single = buildCard({
      model: { concurrentUsers: 1 },
      hosting: { gpuCount: "1", gpuBandwidth: "1500" },
    });
    const many = buildCard({
      model: { concurrentUsers: 8 },
      hosting: { gpuCount: "1", gpuBandwidth: "1500" },
    });
    const { result, rerender } = renderHook(({ c }) => useValueScore(c), {
      initialProps: { c: single },
    });
    const sys1 = result.current.tpsSystem;
    rerender({ c: many });
    const sys8 = result.current.tpsSystem;
    if (sys1 === null || sys8 === null) {
      throw new Error("tpsSystem unexpectedly null with bandwidth configured");
    }
    expect(sys8).toBeGreaterThan(sys1);
  });

  it("returns a stable reference across renders with the same config (memo works)", () => {
    const card = buildCard({
      hosting: { gpuCount: "1", gpuBandwidth: "1500" },
    });
    const { result, rerender } = renderHook(({ c }) => useValueScore(c), {
      initialProps: { c: card },
    });
    const first = result.current;
    rerender({ c: card });
    expect(result.current).toBe(first);
  });

  it("uses customModel architecture (not catalog) when modelKey === 'custom'", () => {
    // Build a tiny custom model so the resulting TPS is clearly larger
    // than the default known catalog entry — proves the custom path is hit.
    const card = buildCard({
      model: {
        modelKey: "custom",
        customModel: {
          name: "Tiny",
          params: 1e9,
          layers: 8,
          kvHeads: 4,
          headDim: 64,
          moe: false,
        },
      },
      hosting: { gpuCount: "1", gpuBandwidth: "1500" },
    });
    const { result } = renderHook(() => useValueScore(card));
    const tps = result.current.tps;
    if (tps === null) throw new Error("custom-model TPS unexpectedly null");
    expect(tps).toBeGreaterThan(0);
  });
});
