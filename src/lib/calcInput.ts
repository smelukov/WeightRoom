import type { ValueScoreInput } from "./calculator";
import { KNOWN_MODELS } from "./models";
import type { CalcOptions, CardData, ModelConfig } from "./types";

/**
 * Resolve the effective model configuration for a card, regardless of whether
 * the user picked a known model from the catalog or entered a custom one.
 * Returns null when the model key is invalid (e.g. stale URL state referencing
 * a removed catalog entry).
 */
export function resolveModel(config: CardData): ModelConfig | null {
  if (config.model.modelKey === "custom") {
    return config.model.customModel;
  }
  return KNOWN_MODELS[config.model.modelKey] ?? null;
}

/**
 * Build the input for `calcLLMRam` from a card and its resolved model.
 * Keeping this in one place guarantees RAM and value-score estimates stay in
 * sync with the same architectural parameters (KV formula, sliding window,
 * MLA latent, MoE activeParams, concurrency settings).
 */
export function getCalcOptions(
  config: CardData,
  model: ModelConfig,
): CalcOptions {
  return {
    params: model.params,
    layers: model.layers,
    kvHeads: model.kvHeads,
    headDim: model.headDim,
    moe: model.moe,
    activeParams: model.activeParams,
    contextTokens: config.model.contextK * 1024,
    quant: config.model.quant,
    kvQuant: config.model.kvQuant,
    osOverheadGb: config.hosting.osOverheadGb ?? 2,
    kvFormula: model.kvFormula,
    slidingWindow: model.slidingWindow,
    fullLayers: model.fullLayers,
    fullKvHeads: model.fullKvHeads,
    fullHeadDim: model.fullHeadDim,
    kvFactor: model.kvFactor,
    kvLoraRank: model.kvLoraRank,
    qkRopeHeadDim: model.qkRopeHeadDim,
    concurrentUsers: config.model.concurrentUsers ?? 1,
    kvCacheFillPct: config.model.kvCacheFillPct ?? 100,
  };
}

/**
 * Build the input for `calcValueScore` from a card and its resolved model.
 * Mirrors `getCalcOptions` so every architectural field (kvFormula, MLA latent,
 * sliding window, MoE activeParams) flows into the TPS calculation for both
 * known and custom models — the AGENTS.md invariant requires this parity.
 */
export function getValueScoreInput(
  config: CardData,
  model: ModelConfig,
): ValueScoreInput {
  return {
    params: model.params,
    layers: model.layers,
    kvHeads: model.kvHeads,
    headDim: model.headDim,
    moe: model.moe,
    activeParams: model.activeParams,
    quant: config.model.quant,
    kvQuant: config.model.kvQuant,
    contextTokens: config.model.contextK * 1024,
    price: parseFloat(config.hosting.price) || 0,
    gpuCount: parseInt(config.hosting.gpuCount) || 0,
    gpuBandwidthGBs: parseFloat(config.hosting.gpuBandwidth) || 0,
    ramBandwidthGBs: parseFloat(config.hosting.ramBandwidthGBs) || 0,
    efficiency: (parseFloat(config.hosting.efficiency) || 80) / 100,
    kvFormula: model.kvFormula,
    slidingWindow: model.slidingWindow,
    fullLayers: model.fullLayers,
    fullKvHeads: model.fullKvHeads,
    fullHeadDim: model.fullHeadDim,
    kvFactor: model.kvFactor,
    kvLoraRank: model.kvLoraRank,
    qkRopeHeadDim: model.qkRopeHeadDim,
    concurrentUsers: config.model.concurrentUsers ?? 1,
    kvCacheFillPct: config.model.kvCacheFillPct ?? 100,
  };
}
