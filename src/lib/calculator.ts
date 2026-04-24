import type { CalcOptions, CalcResult } from "./types";
import type { QuantName } from "./types";
import { QUANT_BITS } from "./quants";

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

export function calcLLMRam(opts: CalcOptions): CalcResult {
  const {
    params,
    layers,
    kvHeads,
    headDim,
    contextTokens,
    quant,
    kvQuant,
    osOverheadGb = 2,
  } = opts;

  // Weights: N_params * (bits / 8) * overhead
  // ×1.1 accounts for embeddings/norms/lm_head stored in higher precision for standard quants.
  // For q1 (1-bit), ALL tensors are quantized — scale factor overhead is baked into QUANT_BITS[q1].
  const weightBits = QUANT_BITS[quant] ?? 4;
  const weightBytes = params * (weightBits / 8);
  const weightOverhead = quant === "q1" ? 1.0 : 1.1;
  const weightsGb = (weightBytes / 1e9) * weightOverhead;

  // KV cache: depends on architecture
  const kvBits = QUANT_BITS[kvQuant] ?? 16;
  const bytesPerEl = kvBits / 8;
  const formula = opts.kvFormula ?? "standard";

  let kvCacheBytes: number;

  switch (formula) {
    case "standard":
      kvCacheBytes =
        2 * layers * kvHeads * headDim * contextTokens * bytesPerEl;
      break;

    case "hybrid": {
      const sw = opts.slidingWindow ?? 4096;
      const fl = opts.fullLayers ?? Math.floor(layers / 2);
      const sl = layers - fl;
      const fKvH = opts.fullKvHeads ?? kvHeads;
      const fHD = opts.fullHeadDim ?? headDim;
      const factor = opts.kvFactor ?? 2;
      const slidingTokens = Math.min(contextTokens, sw);

      kvCacheBytes =
        factor * sl * kvHeads * headDim * slidingTokens * bytesPerEl +
        factor * fl * fKvH * fHD * contextTokens * bytesPerEl;
      break;
    }

    case "mla": {
      const rank = opts.kvLoraRank ?? 512;
      const rope = opts.qkRopeHeadDim ?? 64;
      // MLA: no factor of 2 — latent jointly encodes K and V
      kvCacheBytes = layers * (rank + rope) * contextTokens * bytesPerEl;
      break;
    }

    case "linear_hybrid": {
      const fl = opts.fullLayers ?? Math.floor(layers / 4);
      const factor = opts.kvFactor ?? 2;
      // Linear attention layers use fixed-size recurrent state (negligible).
      // Only sparse full-attention layers have a traditional growing KV cache.
      kvCacheBytes =
        factor * fl * kvHeads * headDim * contextTokens * bytesPerEl;
      break;
    }
  }

  const concurrentUsers = opts.concurrentUsers ?? 1;
  const kvCacheFill = (opts.kvCacheFillPct ?? 100) / 100;
  const kvCacheGb = (kvCacheBytes / 1e9) * concurrentUsers * kvCacheFill;
  const totalGb = weightsGb + kvCacheGb + osOverheadGb;

  return {
    weightsGb: round(weightsGb),
    kvCacheGb: round(kvCacheGb),
    osOverheadGb: round(osOverheadGb),
    totalGb: round(totalGb),
  };
}

export function getRecommendedInstance(totalGb: number): string {
  const tiers = [8, 16, 32, 48, 64, 96, 128, 192, 256];
  for (const tier of tiers) {
    if (totalGb <= tier * 0.9) {
      return `${tier} GB instance`;
    }
  }
  return "256+ GB / multi-GPU setup";
}

export function getRamStatus(
  totalGb: number,
  availableRam: number,
): "fits" | "tight" | "exceeds" {
  // Guard against "no hardware entered" (0 GB) and negative inputs. Without
  // this, totalGb / 0 = Infinity → status would always be "exceeds" on a
  // fresh card. We return "fits" so the UI doesn't display a misleading
  // red warning before the user has provided any hardware info.
  if (availableRam <= 0) return "fits";
  const ratio = totalGb / availableRam;
  if (ratio <= 0.8) return "fits";
  if (ratio <= 1.0) return "tight";
  return "exceeds";
}

/** Breakdown of estimated on-disk storage requirements. */
export interface DiskResult {
  /** Quantized model file size on disk (GGUF, GPTQ, AWQ, MLX, or float). */
  modelFileGb: number;
  /** Fixed OS / system files overhead. */
  osOverheadGb: number;
  totalGb: number;
}

const DISK_OS_OVERHEAD_GB = 20;

/**
 * Estimated on-disk storage requirements.
 * Model file: params × bits/8 × 1.05 (for unquantized embedding/norm layers).
 * OS overhead: 20 GB for a lean Linux installation.
 */
export function calcDisk(params: number, quant: QuantName): DiskResult {
  const bits = QUANT_BITS[quant] ?? 4;
  const modelFileGb = round((params * (bits / 8) * 1.05) / 1e9);
  const osOverheadGb = DISK_OS_OVERHEAD_GB;
  return {
    modelFileGb,
    osOverheadGb,
    totalGb: round(modelFileGb + osOverheadGb),
  };
}

export function getDiskStatus(
  totalDiskGb: number,
  availableStorage: number,
): "fits" | "tight" | "exceeds" {
  // See getRamStatus — same guard against division by zero on a fresh card.
  if (availableStorage <= 0) return "fits";
  const ratio = totalDiskGb / availableStorage;
  if (ratio <= 0.8) return "fits";
  if (ratio <= 1.0) return "tight";
  return "exceeds";
}

/**
 * Bytes per parameter for each quantization level.
 *
 * Used by `calcValueScore` for TPS / bandwidth math (kept separate from
 * `QUANT_BITS` so we can reason about RAM/disk in bits and TPS in bytes
 * without juggling unit conversions inside the formulas — see AGENTS.md).
 *
 * Values mirror QUANT_SPECS.bpw / 8 — when adding a new quant, update both.
 */
export const QUANT_BYTES: Record<string, number> = {
  fp32: 4,
  fp16: 2,
  bf16: 2,
  q8: 1,
  q8_0: 1,
  q6_k: 0.75,
  q5_k_m: 0.625,
  q4_k_m: 0.5,
  q4: 0.5,
  q3_k_m: 0.375,
  q2_k: 0.25,
  // q1 = 1.25 bpw (sign bit + 0.25 bpw amortized scale/bias) — matches
  // QUANT_BITS["q1"]. Previously this was 0.125 (1.0 bpw exactly) which
  // was inconsistent with the RAM math and would have surfaced as a TPS
  // estimate ~25% too high for 1-bit models.
  q1: 1.25 / 8,
  // GPTQ — bpw/8 with +0.25 bpw overhead for FP16 scale + zero-point per g128
  gptq_8bit: 8.25 / 8,
  gptq_4bit: 4.25 / 8,
  gptq_3bit: 3.25 / 8,
  // AWQ — same +0.25 bpw overhead (FP16 scale + scaled_zero per g128)
  awq_4bit: 4.25 / 8,
  // MLX — bits + 0.5 bpw (FP16 scale + bias per g64)
  mlx_8bit: 8.5 / 8,
  mlx_4bit: 4.5 / 8,
  mlx_3bit: 3.5 / 8,
  mlx_2bit: 2.5 / 8,
};

/** Input for value score calculation. */
export interface ValueScoreInput {
  /** Model parameters count (total — for MoE this is all experts combined). */
  params: number;
  /** Number of transformer layers. */
  layers: number;
  /** Number of KV heads. */
  kvHeads: number;
  /** Head dimension. */
  headDim: number;
  /**
   * Mixture of Experts flag. When true and `activeParams` is provided,
   * TPS / bandwidth traffic is driven by `activeParams` (only the shared
   * trunk + top-k experts read per token) instead of the full `params`
   * count. RAM / disk are always sized on `params`, because every expert
   * must stay resident in memory.
   */
  moe?: boolean | undefined;
  /**
   * Parameters activated per token for MoE models. Ignored unless `moe`
   * is true. Examples: Mixtral 8x7B ≈ 12.9B; Qwen3-30B-A3B ≈ 3B;
   * DeepSeek V3 ≈ 37B.
   */
  activeParams?: number | undefined;
  /** Model quantization. */
  quant: QuantName;
  /** KV cache quantization. */
  kvQuant: QuantName;
  /** Context length in tokens. */
  contextTokens: number;
  /** Hosting price in $/mo. */
  price: number;
  /** Number of GPU devices. */
  gpuCount: number;
  /** GPU memory bandwidth in GB/s per device. */
  gpuBandwidthGBs: number;
  /** System RAM bandwidth in GB/s (fallback when no GPU). */
  ramBandwidthGBs: number;
  /**
   * Bandwidth efficiency factor (0–1). Ratio of real-world throughput to
   * theoretical peak bandwidth. Accounts for non-sequential access patterns,
   * dequantization overhead, kernel launch latency, and driver overhead.
   * Defaults to 0.8 if omitted.
   */
  efficiency?: number | undefined;
  // Architecture-specific KV cache params (for accurate KV traffic calculation)
  kvFormula?: import("./types").KvFormula | undefined;
  slidingWindow?: number | undefined;
  fullLayers?: number | undefined;
  fullKvHeads?: number | undefined;
  fullHeadDim?: number | undefined;
  kvFactor?: number | undefined;
  kvLoraRank?: number | undefined;
  qkRopeHeadDim?: number | undefined;
  /** Number of concurrent users / parallel slots. KV traffic is multiplied by N. Default: 1. */
  concurrentUsers?: number | undefined;
  /**
   * Average KV cache fill percentage (1–100).
   * 100 = llama.cpp full pre-allocation, ~25 = vLLM PagedAttention typical chatbot.
   * Default: 100.
   */
  kvCacheFillPct?: number | undefined;
}

/** Result of value score calculation. */
export interface ValueScoreResult {
  /** Raw value score (TPS per dollar). Higher is better. */
  rawScore: number;
  /** Estimated per-user TPS, if calculable. */
  tps: number | null;
  /** Estimated system-wide TPS (tps × concurrentUsers). */
  tpsSystem: number | null;
  /** Whether the score is based on TPS (true) or bandwidth fallback (false). */
  isTpsBased: boolean;
}

/**
 * Calculate value score: TPS per dollar (preferred) or bandwidth-based fallback.
 *
 * Primary formula: TPS / price
 * - TPS = effective_bandwidth / (model_size + kv_cache_traffic)
 * - Accounts for model size, quantization, context length, and hardware bandwidth
 *
 * Fallback formula (when model params unknown or no bandwidth):
 * - (effective_bandwidth / model_size_estimate) / price
 * - Uses model size estimate based on params and quantization
 *
 * Returns null if price is 0 or missing required data.
 */
export function calcValueScore(
  input: ValueScoreInput,
): ValueScoreResult | null {
  const {
    params,
    layers,
    kvHeads,
    headDim,
    quant,
    kvQuant,
    contextTokens,
    price,
    gpuCount,
    gpuBandwidthGBs,
    ramBandwidthGBs,
  } = input;

  // Determine effective bandwidth, scaled by efficiency factor
  const efficiencyFactor = input.efficiency != null ? input.efficiency : 0.8;
  const hasGPU = gpuCount > 0 && gpuBandwidthGBs > 0;
  const effectiveBW = (hasGPU ? gpuCount * gpuBandwidthGBs : ramBandwidthGBs) * efficiencyFactor;
  if (effectiveBW === 0) return null;

  const bytesPerParam = QUANT_BYTES[quant] || 0.5;
  const kvBytesPerParam = QUANT_BYTES[kvQuant] || 2;

  const formula = input.kvFormula ?? "standard";

  // Check if we have enough model data for a TPS calculation. MLA models
  // (DeepSeek V2 / V3) don't expose `kvHeads` or `headDim` the same way —
  // their KV cache is parameterised by `kvLoraRank` + `qkRopeHeadDim`,
  // so we don't require the GQA fields when formula === "mla".
  const hasArchData =
    formula === "mla"
      ? params > 0 &&
        layers > 0 &&
        (input.kvLoraRank ?? 0) > 0 &&
        (input.qkRopeHeadDim ?? 0) > 0
      : params > 0 && layers > 0 && kvHeads > 0 && headDim > 0;

  // For MoE models, TPS is driven by the active expert count (only kA out
  // of E experts read per token), not the total parameter count. This is
  // the single most important correction for Mixtral / Qwen3 MoE /
  // DeepSeek V3 — otherwise their TPS gets under-estimated by up to ~10×
  // (e.g. on a 30B-A3B model). Total params still sit in RAM (handled by
  // calcLLMRam); only the bandwidth-bound decode path uses activeParams.
  const effectiveParams =
    input.moe && input.activeParams && input.activeParams > 0
      ? input.activeParams
      : params;

  const concurrentUsers = input.concurrentUsers ?? 1;
  const kvCacheFill = (input.kvCacheFillPct ?? 100) / 100;
  const kvScale = concurrentUsers * kvCacheFill;

  let tps: number | null = null;
  let tpsSystem: number | null = null;
  let rawScore = 0;

  if (hasArchData) {
    // Primary: TPS-based calculation.
    // Weights traffic per token uses effectiveParams (activeParams for MoE).
    const modelSizeGB = (effectiveParams * bytesPerParam * 1.1) / 1e9;

    // KV traffic per decode step: every formula unifies on
    // (contextTokens + 1) — the model reads the cached K/V for all prior
    // tokens AND writes the single token currently being generated. The
    // sliding-window portion of `hybrid` caps at the window size (the new
    // entry evicts the oldest one, so traffic stays bounded).
    const tokensRead = contextTokens + 1;
    let kvTrafficPerUserGB: number;
    switch (formula) {
      case "hybrid": {
        const sw = input.slidingWindow ?? 4096;
        const fl = input.fullLayers ?? Math.floor(layers / 2);
        const sl = layers - fl;
        const fKvH = input.fullKvHeads ?? kvHeads;
        const fHD = input.fullHeadDim ?? headDim;
        const factor = input.kvFactor ?? 2;
        const slidingTokens = Math.min(tokensRead, sw);
        kvTrafficPerUserGB =
          (factor * sl * kvHeads * headDim * slidingTokens * kvBytesPerParam +
            factor * fl * fKvH * fHD * tokensRead * kvBytesPerParam) /
          1e9;
        break;
      }
      case "linear_hybrid": {
        const fl = input.fullLayers ?? Math.floor(layers / 4);
        const factor = input.kvFactor ?? 2;
        kvTrafficPerUserGB =
          (factor * fl * kvHeads * headDim * tokensRead * kvBytesPerParam) /
          1e9;
        break;
      }
      case "mla": {
        const rank = input.kvLoraRank ?? 512;
        const rope = input.qkRopeHeadDim ?? 64;
        kvTrafficPerUserGB =
          (layers * (rank + rope) * tokensRead * kvBytesPerParam) / 1e9;
        break;
      }
      default: {
        kvTrafficPerUserGB =
          (2 * layers * kvHeads * headDim * tokensRead * kvBytesPerParam) /
          1e9;
      }
    }

    // Total KV traffic across all concurrent users (scaled by fill ratio)
    const kvTrafficGB = kvTrafficPerUserGB * kvScale;

    // Per-user TPS: bandwidth is shared across all users' KV caches
    tps = Math.round((effectiveBW / (modelSizeGB + kvTrafficGB)) * 10) / 10;
    // System-wide throughput: N tokens produced per decode step
    tpsSystem = Math.round(tps * concurrentUsers * 10) / 10;
    // Value score uses system TPS: the server produces tpsSystem tokens/s for the given price,
    // regardless of how many users share that throughput.
    rawScore = price > 0 ? tpsSystem / price : 0;
  } else if (params > 0) {
    // Fallback 1: Bandwidth per model size (when we have params but not
    // architecture details). Use effectiveParams so MoE estimates stay
    // consistent with the primary TPS path.
    const modelSizeGB = (effectiveParams * bytesPerParam * 1.1) / 1e9;
    const estimatedTps = effectiveBW / modelSizeGB;
    rawScore = price > 0 ? estimatedTps / price : 0;
  } else {
    // Fallback 2: Bandwidth per dollar weighted by quantization (minimal info)
    const quantFactor = 2 / bytesPerParam;
    rawScore = price > 0 ? (effectiveBW * quantFactor) / price / 1e9 : 0;
  }

  // Return null only if we have no bandwidth at all (already checked above)
  // or if price is 0 and we have no TPS (no model data for TPS calc)
  if (price <= 0 && tps === null) return null;

  return {
    rawScore,
    tps,
    tpsSystem,
    isTpsBased: tps !== null,
  };
}

export { normalizeScores, getValueColor, getTpsLabel, type TpsLabel } from "./scoring";
