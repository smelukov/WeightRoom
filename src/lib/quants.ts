import type { QuantName } from "./types";

/**
 * Bits per weight parameter for each quantization format.
 * Used in RAM and disk size calculations.
 */
export const QUANT_BITS: Record<QuantName, number> = {
  fp32: 32,
  fp16: 16,
  bf16: 16,
  q8: 8,
  q8_0: 8,
  q6_k: 6,
  q5_k_m: 5,
  q4_k_m: 4,
  q4: 4,
  q3_k_m: 3,
  q2_k: 2,
  // Effective 1.25 bpw: 1 sign bit + 2×F16 scale/bias per group of 128 weights (MLX format).
  // For GGUF Q1_0 the real bpw is ~1.125, but MLX is the typical import path here.
  q1: 1.25,
};

/** Quantization options for model weights, ordered from highest to lowest precision. */
export const WEIGHT_QUANTS: { value: QuantName; label: string }[] = [
  { value: "fp32", label: "FP32 (32-bit)" },
  { value: "bf16", label: "BF16 (16-bit)" },
  { value: "fp16", label: "FP16 (16-bit)" },
  { value: "q8_0", label: "Q8_0 (8-bit)" },
  { value: "q6_k", label: "Q6_K (6-bit)" },
  { value: "q5_k_m", label: "Q5_K_M (5-bit)" },
  { value: "q4_k_m", label: "Q4_K_M (4-bit)" },
  { value: "q3_k_m", label: "Q3_K_M (3-bit)" },
  { value: "q2_k", label: "Q2_K (2-bit)" },
  { value: "q1", label: "Q1_0 (1-bit)" },
];

/** Quantization options for the KV cache, ordered from highest to lowest precision. */
export const KV_QUANTS: { value: QuantName; label: string }[] = [
  { value: "bf16", label: "BF16 (default)" },
  { value: "fp16", label: "FP16" },
  { value: "q8_0", label: "Q8_0 (half size)" },
  { value: "q4", label: "Q4 (quarter size)" },
];
