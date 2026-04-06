import { describe, it, expect } from "vitest";
import {
  resolveModel,
  getCalcOptions,
  getValueScoreInput,
} from "../calcInput";
import { KNOWN_MODELS } from "../models";
import type {
  CardData,
  HostingData,
  ModelConfig,
  ModelSettings,
} from "../types";

// ─── Helpers ────────────────────────────────────────────────────────────────
//
// buildCard wires up a realistic CardData with sane defaults so each test
// only spells out what it actually cares about. Hosting strings default to
// empty (matches the UI's "blank input" state) so number-parsing edge cases
// in getValueScoreInput show up explicitly when overridden.

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
    modelKey: "qwen3.5-27b",
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
    contextK: 32,
    concurrentUsers: 1,
    kvCacheFillPct: 100,
    ...overrides,
  };
}

function buildCard(overrides: {
  model?: Partial<ModelSettings>;
  hosting?: Partial<HostingData>;
  id?: string;
} = {}): CardData {
  return {
    id: overrides.id ?? "test-card",
    hfImportUrl: "",
    model: buildModelSettings(overrides.model),
    hosting: buildHosting(overrides.hosting),
  };
}

// ─── resolveModel ───────────────────────────────────────────────────────────

describe("resolveModel", () => {
  it("returns customModel verbatim when modelKey is 'custom' (does not consult KNOWN_MODELS)", () => {
    // Custom mode must win even if the customModel name happens to match a
    // catalog key — otherwise edits to a custom model would silently route
    // to the catalog version.
    const customModel: ModelConfig = {
      name: "My weird MoE",
      params: 1.234e9,
      layers: 7,
      kvHeads: 1,
      headDim: 64,
      moe: true,
      activeParams: 0.5e9,
    };
    const card = buildCard({ model: { modelKey: "custom", customModel } });
    expect(resolveModel(card)).toBe(customModel); // identity, not a copy
  });

  it("returns the catalog entry by reference for a known model key", () => {
    const card = buildCard({ model: { modelKey: "gemma2-9b" } });
    const resolved = resolveModel(card);
    // We assert by-reference identity on purpose: a copy would defeat the
    // useMemo dependency comparisons higher up the tree.
    expect(resolved).toBe(KNOWN_MODELS["gemma2-9b"]);
  });

  it("returns null (not undefined) for a missing/stale catalog key", () => {
    // The contract is null because callers (useCalcResult, useValueScore)
    // explicitly compare with `if (!model)`. If this ever switches to
    // returning undefined the property `?: T | undefined` types in
    // ModelConfig would still pass — only this test would catch it.
    const card = buildCard({ model: { modelKey: "totally-made-up-model" } });
    const resolved = resolveModel(card);
    expect(resolved).toBeNull();
    expect(resolved).not.toBeUndefined();
  });
});

// ─── getCalcOptions ─────────────────────────────────────────────────────────

describe("getCalcOptions", () => {
  it("converts contextK to contextTokens via the binary 1024 factor", () => {
    // 1024 vs 1000 is the most likely silent regression: tests against a
    // round number wouldn't catch it, so we use a value that visibly
    // distinguishes the two (32 * 1024 = 32768, 32 * 1000 = 32000).
    const card = buildCard({ model: { contextK: 32 } });
    const opts = getCalcOptions(card, KNOWN_MODELS["gemma2-9b"]!);
    expect(opts.contextTokens).toBe(32 * 1024);
    expect(opts.contextTokens).not.toBe(32 * 1000);
  });

  it("falls back osOverheadGb to 2 GB when hosting field is missing (legacy URL state)", () => {
    // hosting.osOverheadGb is typed as `number`, but historic URL payloads
    // shipped without it. The `?? 2` guard exists for that reason — we cast
    // through unknown to simulate the legacy shape without `any`.
    const hosting = buildHosting();
    const legacyHosting = {
      ...hosting,
      osOverheadGb: undefined,
    } as unknown as HostingData;
    const card: CardData = {
      ...buildCard(),
      hosting: legacyHosting,
    };
    expect(getCalcOptions(card, KNOWN_MODELS["gemma2-9b"]!).osOverheadGb).toBe(
      2,
    );
  });

  it("defaults concurrentUsers to 1 and kvCacheFillPct to 100 when missing", () => {
    const card = buildCard();
    // Strip the optional fields the same way old URL payloads would.
    const stripped: CardData = {
      ...card,
      model: { ...card.model, concurrentUsers: undefined as unknown as number, kvCacheFillPct: undefined as unknown as number },
    };
    const opts = getCalcOptions(stripped, KNOWN_MODELS["gemma2-9b"]!);
    expect(opts.concurrentUsers).toBe(1);
    expect(opts.kvCacheFillPct).toBe(100);
  });

  it("forwards ALL architecture fields from the model 1:1 (no silent defaults)", () => {
    // This is the regression that would silently corrupt RAM math: if a new
    // arch field is added to ModelConfig but forgotten in getCalcOptions,
    // calcLLMRam would fall back to default behaviour (e.g. treating MLA as
    // standard GQA). We enumerate every field below; adding a new one to
    // ModelConfig forces this test to be updated as well.
    const archModel: ModelConfig = {
      params: 70e9,
      layers: 80,
      kvHeads: 8,
      headDim: 128,
      moe: true,
      activeParams: 12.9e9,
      kvFormula: "mla",
      slidingWindow: 4096,
      fullLayers: 21,
      fullKvHeads: 4,
      fullHeadDim: 512,
      kvFactor: 1,
      kvLoraRank: 512,
      qkRopeHeadDim: 64,
    };
    const opts = getCalcOptions(buildCard(), archModel);
    expect(opts.params).toBe(archModel.params);
    expect(opts.layers).toBe(archModel.layers);
    expect(opts.kvHeads).toBe(archModel.kvHeads);
    expect(opts.headDim).toBe(archModel.headDim);
    expect(opts.moe).toBe(archModel.moe);
    expect(opts.activeParams).toBe(archModel.activeParams);
    expect(opts.kvFormula).toBe(archModel.kvFormula);
    expect(opts.slidingWindow).toBe(archModel.slidingWindow);
    expect(opts.fullLayers).toBe(archModel.fullLayers);
    expect(opts.fullKvHeads).toBe(archModel.fullKvHeads);
    expect(opts.fullHeadDim).toBe(archModel.fullHeadDim);
    expect(opts.kvFactor).toBe(archModel.kvFactor);
    expect(opts.kvLoraRank).toBe(archModel.kvLoraRank);
    expect(opts.qkRopeHeadDim).toBe(archModel.qkRopeHeadDim);
  });

  it("uses quant/kvQuant from card.model, not from the model's catalog entry", () => {
    // The catalog entry has no quant fields, but if this ever changed we'd
    // want to be sure the user-selected quant wins.
    const card = buildCard({
      model: { quant: "q8_0", kvQuant: "fp16" },
    });
    const opts = getCalcOptions(card, KNOWN_MODELS["gemma2-9b"]!);
    expect(opts.quant).toBe("q8_0");
    expect(opts.kvQuant).toBe("fp16");
  });
});

// ─── getValueScoreInput ─────────────────────────────────────────────────────

describe("getValueScoreInput", () => {
  it("parses hosting numeric strings and falls back to 0 on empty/garbage", () => {
    const card = buildCard({
      hosting: {
        price: "",
        gpuCount: "abc",
        gpuBandwidth: "",
        ramBandwidthGBs: "not-a-number",
      },
    });
    const inp = getValueScoreInput(card, KNOWN_MODELS["gemma2-9b"]!);
    expect(inp.price).toBe(0);
    expect(inp.gpuCount).toBe(0);
    expect(inp.gpuBandwidthGBs).toBe(0);
    expect(inp.ramBandwidthGBs).toBe(0);
  });

  it("parses well-formed hosting strings as numbers", () => {
    const card = buildCard({
      hosting: {
        price: "1500",
        gpuCount: "8",
        gpuBandwidth: "1555",
        ramBandwidthGBs: "90",
      },
    });
    const inp = getValueScoreInput(card, KNOWN_MODELS["gemma2-9b"]!);
    expect(inp.price).toBe(1500);
    expect(inp.gpuCount).toBe(8);
    expect(inp.gpuBandwidthGBs).toBe(1555);
    expect(inp.ramBandwidthGBs).toBe(90);
  });

  it("truncates fractional gpuCount via parseInt (8.7 → 8)", () => {
    // Important: parseInt, not parseFloat. A fractional GPU count is
    // nonsensical, and we want it to floor rather than e.g. round.
    const card = buildCard({ hosting: { gpuCount: "8.7" } });
    expect(getValueScoreInput(card, KNOWN_MODELS["gemma2-9b"]!).gpuCount).toBe(8);
  });

  it("converts efficiency from percent to fraction; defaults to 0.8 when blank", () => {
    const blank = getValueScoreInput(
      buildCard({ hosting: { efficiency: "" } }),
      KNOWN_MODELS["gemma2-9b"]!,
    );
    expect(blank.efficiency).toBeCloseTo(0.8, 10);

    const explicit = getValueScoreInput(
      buildCard({ hosting: { efficiency: "65" } }),
      KNOWN_MODELS["gemma2-9b"]!,
    );
    expect(explicit.efficiency).toBeCloseTo(0.65, 10);

    const max = getValueScoreInput(
      buildCard({ hosting: { efficiency: "100" } }),
      KNOWN_MODELS["gemma2-9b"]!,
    );
    expect(max.efficiency).toBeCloseTo(1.0, 10);
  });

  it("KNOWN QUIRK: efficiency='0' is silently treated as the 80% default", () => {
    // `(parseFloat("0") || 80) / 100` evaluates to 0.8, not 0. This means a
    // user explicitly typing "0" gets the default instead of zero — which
    // IS a real bug (intent is unambiguous), but fixing it changes user-
    // visible behaviour. Pinning the current behaviour here so a future
    // fix has to consciously update this assertion.
    const inp = getValueScoreInput(
      buildCard({ hosting: { efficiency: "0" } }),
      KNOWN_MODELS["gemma2-9b"]!,
    );
    expect(inp.efficiency).toBeCloseTo(0.8, 10);
  });

  it("uses the same contextTokens convention as getCalcOptions (binary 1024)", () => {
    const card = buildCard({ model: { contextK: 4 } });
    const ramOpts = getCalcOptions(card, KNOWN_MODELS["gemma2-9b"]!);
    const tpsOpts = getValueScoreInput(card, KNOWN_MODELS["gemma2-9b"]!);
    expect(ramOpts.contextTokens).toBe(tpsOpts.contextTokens);
    expect(tpsOpts.contextTokens).toBe(4 * 1024);
  });

  it("AGENTS.md PARITY INVARIANT: every architecture field in the model is forwarded to BOTH calcLLMRam and calcValueScore identically", () => {
    // The most important test in this file. AGENTS.md states that the KV
    // formula switch must be implemented consistently in calcLLMRam and
    // calcValueScore — but consistency upstream (in the input builders)
    // is just as important. If a new arch field gets added to getCalcOptions
    // but forgotten in getValueScoreInput, RAM and TPS would silently
    // diverge for that model.
    const archModel: ModelConfig = {
      params: 70e9,
      layers: 80,
      kvHeads: 8,
      headDim: 128,
      moe: true,
      activeParams: 12.9e9,
      kvFormula: "linear_hybrid",
      slidingWindow: 2048,
      fullLayers: 20,
      fullKvHeads: 4,
      fullHeadDim: 256,
      kvFactor: 1,
      kvLoraRank: 1024,
      qkRopeHeadDim: 64,
    };
    const card = buildCard({
      model: { contextK: 16, concurrentUsers: 4, kvCacheFillPct: 50 },
    });
    const ramOpts = getCalcOptions(card, archModel);
    const tpsOpts = getValueScoreInput(card, archModel);

    const sharedKeys: Array<keyof typeof ramOpts & keyof typeof tpsOpts> = [
      "params",
      "layers",
      "kvHeads",
      "headDim",
      "moe",
      "activeParams",
      "quant",
      "kvQuant",
      "contextTokens",
      "kvFormula",
      "slidingWindow",
      "fullLayers",
      "fullKvHeads",
      "fullHeadDim",
      "kvFactor",
      "kvLoraRank",
      "qkRopeHeadDim",
      "concurrentUsers",
      "kvCacheFillPct",
    ];
    for (const key of sharedKeys) {
      expect(tpsOpts[key], `field "${String(key)}" diverges`).toEqual(
        ramOpts[key],
      );
    }
  });

  it("propagates concurrentUsers and kvCacheFillPct from card.model (not from model arch)", () => {
    // These live on ModelSettings, not ModelConfig — easy to mix up if
    // someone refactors the input builders.
    const card = buildCard({
      model: { concurrentUsers: 7, kvCacheFillPct: 25 },
    });
    const inp = getValueScoreInput(card, KNOWN_MODELS["gemma2-9b"]!);
    expect(inp.concurrentUsers).toBe(7);
    expect(inp.kvCacheFillPct).toBe(25);
  });
});
