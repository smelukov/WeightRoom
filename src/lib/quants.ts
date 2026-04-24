import type { QuantName } from "./types";

/**
 * Quantization family — groups quants by their underlying technique and
 * runtime ecosystem. Used both for grouping in the UI selector and for
 * filtering compatible inference engines (see QUANT_FAMILY_ENGINES).
 */
export type QuantFamily = "float" | "gguf" | "gptq" | "awq" | "mlx";

/**
 * Single source of truth for everything we know about a quantization format:
 * its identifier, display label, effective bits-per-weight (including any
 * scale/zero-point overhead), and which family / ecosystem it belongs to.
 *
 * QUANT_BITS, QUANT_BYTES (in calculator.ts), WEIGHT_QUANTS, and the grouped
 * selector list are all derived from this array.
 */
export interface QuantSpec {
  value: QuantName;
  label: string;
  /**
   * Effective bits per weight, including scale/zero-point overhead.
   *
   * For group-wise PTQ quants (GPTQ, AWQ, MLX) the overhead is the FP16
   * scale (and optionally a zero point) amortized across the group. We
   * round to clean increments rather than carry irrational digits — the
   * remaining 1-2% error is much smaller than the ×1.1 embeddings overhead
   * applied at the calculator level.
   *
   * Exact formulas (annotated per-spec below):
   *   GPTQ-4bit g128 asym: 4 + 16/128 (FP16 scale) + 4/128 (INT4 zero) ≈ 4.156 → 4.25
   *   AWQ-4bit g128 asym:  4 + 16/128 (FP16 scale) + 16/128 (FP16 scaled_zero) = 4.25
   *   MLX-4bit g64:        4 + 16/64 (FP16 scale) + 16/64 (FP16 bias)         = 4.5
   */
  bpw: number;
  family: QuantFamily;
  /** Section heading shown in the grouped Select dropdown. */
  familyLabel: string;
}

/**
 * Master list. Order matters: it controls dropdown order (within each
 * family) and the overall family ordering in `getWeightQuantGroups`.
 */
export const QUANT_SPECS: QuantSpec[] = [
  // ─── Float (training / source precision) ──────────────────────────────────
  {
    value: "fp32",
    label: "FP32 (32-bit)",
    bpw: 32,
    family: "float",
    familyLabel: "Float (training / source)",
  },
  {
    value: "bf16",
    label: "BF16 (16-bit)",
    bpw: 16,
    family: "float",
    familyLabel: "Float (training / source)",
  },
  {
    value: "fp16",
    label: "FP16 (16-bit)",
    bpw: 16,
    family: "float",
    familyLabel: "Float (training / source)",
  },

  // ─── GGUF (llama.cpp / Ollama) ────────────────────────────────────────────
  {
    value: "q8_0",
    label: "Q8_0 (8-bit)",
    bpw: 8,
    family: "gguf",
    familyLabel: "GGUF (llama.cpp / Ollama)",
  },
  {
    value: "q6_k",
    label: "Q6_K (6-bit)",
    bpw: 6,
    family: "gguf",
    familyLabel: "GGUF (llama.cpp / Ollama)",
  },
  {
    value: "q5_k_m",
    label: "Q5_K_M (5-bit)",
    bpw: 5,
    family: "gguf",
    familyLabel: "GGUF (llama.cpp / Ollama)",
  },
  {
    value: "q4_k_m",
    label: "Q4_K_M (4-bit)",
    bpw: 4,
    family: "gguf",
    familyLabel: "GGUF (llama.cpp / Ollama)",
  },
  {
    value: "q3_k_m",
    label: "Q3_K_M (3-bit)",
    bpw: 3,
    family: "gguf",
    familyLabel: "GGUF (llama.cpp / Ollama)",
  },
  {
    value: "q2_k",
    label: "Q2_K (2-bit)",
    bpw: 2,
    family: "gguf",
    familyLabel: "GGUF (llama.cpp / Ollama)",
  },
  {
    // Effective 1.25 bpw: 1 sign bit + 2×F16 scale/bias per group of 128 weights (MLX format).
    // For GGUF Q1_0 the real bpw is ~1.125, but MLX is the typical import path here.
    value: "q1",
    label: "Q1_0 (1-bit)",
    bpw: 1.25,
    family: "gguf",
    familyLabel: "GGUF (llama.cpp / Ollama)",
  },

  // ─── MLX (Apple Silicon — mlx_lm.convert default group_size=64) ───────────
  // bpw = bits + 16/64 (FP16 scale) + 16/64 (FP16 bias) = bits + 0.5
  {
    value: "mlx_8bit",
    label: "MLX 8-bit (g64)",
    bpw: 8.5,
    family: "mlx",
    familyLabel: "MLX (Apple Silicon)",
  },
  {
    value: "mlx_4bit",
    label: "MLX 4-bit (g64)",
    bpw: 4.5,
    family: "mlx",
    familyLabel: "MLX (Apple Silicon)",
  },
  {
    value: "mlx_3bit",
    label: "MLX 3-bit (g64)",
    bpw: 3.5,
    family: "mlx",
    familyLabel: "MLX (Apple Silicon)",
  },
  {
    value: "mlx_2bit",
    label: "MLX 2-bit (g64)",
    bpw: 2.5,
    family: "mlx",
    familyLabel: "MLX (Apple Silicon)",
  },

  // ─── GPTQ (calibration-based PTQ for GPU — vLLM / ExLlama / AutoGPTQ) ─────
  // bpw = bits + 16/128 (FP16 scale) + bits/128 (zero point) ≈ bits + 0.13
  // Rounded to bits + 0.25 for consistency with AWQ.
  {
    value: "gptq_8bit",
    label: "GPTQ 8-bit (g128)",
    bpw: 8.25,
    family: "gptq",
    familyLabel: "GPTQ (vLLM / ExLlama, GPU)",
  },
  {
    value: "gptq_4bit",
    label: "GPTQ 4-bit (g128)",
    bpw: 4.25,
    family: "gptq",
    familyLabel: "GPTQ (vLLM / ExLlama, GPU)",
  },
  {
    value: "gptq_3bit",
    label: "GPTQ 3-bit (g128)",
    bpw: 3.25,
    family: "gptq",
    familyLabel: "GPTQ (vLLM / ExLlama, GPU)",
  },

  // ─── AWQ (activation-aware PTQ for GPU — vLLM / AutoAWQ) ──────────────────
  // bpw = 4 + 16/128 (FP16 scale) + 16/128 (FP16 scaled_zero) = 4.25
  {
    value: "awq_4bit",
    label: "AWQ 4-bit (g128)",
    bpw: 4.25,
    family: "awq",
    familyLabel: "AWQ (vLLM / AutoAWQ, GPU)",
  },
];

/**
 * Compatibility matrix: which engine presets can run a given quant family.
 *
 * Quant determines engine, not the other way around — GGUF only runs on
 * llama.cpp-compatible runtimes; GPTQ/AWQ are GPU-only with vLLM/TensorRT;
 * MLX only on the MLX runtime (which we currently group under the 100%
 * pre-allocation preset alongside llama.cpp). Float weights run anywhere.
 *
 * Engine ids match `EnginePreset.id` in `enginePresets.ts`. The string
 * "custom" is always included so the user can override with manual KV %.
 */
export const QUANT_FAMILY_ENGINES: Record<QuantFamily, ReadonlySet<string>> = {
  float: new Set(["llamacpp", "vllm", "tensorrt", "custom"]),
  gguf: new Set(["llamacpp", "custom"]),
  mlx: new Set(["llamacpp", "custom"]),
  gptq: new Set(["vllm", "tensorrt", "custom"]),
  awq: new Set(["vllm", "tensorrt", "custom"]),
};

/**
 * Bits per weight parameter for each quantization format.
 * Used in RAM and disk size calculations. Derived from QUANT_SPECS.
 *
 * Aliases (`q4`, `q8`) are added separately because they don't appear in the
 * weights selector but ARE valid `QuantName` values (KV-cache options + the
 * HF auto-detection fallback for generic INT4 / INT8 dtypes). Without them,
 * `QUANT_BITS["q4"]` would silently fall back to 16 in `calcLLMRam` and the
 * KV cache would be sized as if it were FP16 — see the parameterised
 * "QUANT_BYTES matches QUANT_BITS / 8" test in calculator.test.ts.
 */
export const QUANT_BITS: Record<QuantName, number> = {
  ...(Object.fromEntries(QUANT_SPECS.map((q) => [q.value, q.bpw])) as Record<
    QuantName,
    number
  >),
  q8: 8,
  q4: 4,
};

/**
 * Look up the family for a given quant name. Falls back to "gguf" for
 * unknown values (which can only happen if a stale URL references a quant
 * we removed from QUANT_SPECS — keeps the calculator usable rather than
 * crashing).
 */
export function getQuantFamily(quant: QuantName): QuantFamily {
  return QUANT_SPECS.find((q) => q.value === quant)?.family ?? "gguf";
}

/** A QuantSpec group rendered as one section in the dropdown. */
export interface QuantGroup {
  family: QuantFamily;
  familyLabel: string;
  items: QuantSpec[];
}

/**
 * Group QUANT_SPECS by family while preserving the order in which families
 * first appear in QUANT_SPECS. Returns a fresh array so callers can mutate
 * it without affecting the singleton.
 */
export function getWeightQuantGroups(): QuantGroup[] {
  const groups: QuantGroup[] = [];
  const byLabel = new Map<string, QuantGroup>();
  for (const spec of QUANT_SPECS) {
    let group = byLabel.get(spec.familyLabel);
    if (!group) {
      group = {
        family: spec.family,
        familyLabel: spec.familyLabel,
        items: [],
      };
      byLabel.set(spec.familyLabel, group);
      groups.push(group);
    }
    group.items.push(spec);
  }
  return groups;
}

/**
 * Flat list of weight quants for callers that don't need grouping
 * (kept for backward compatibility with screenshot.tsx and tests).
 */
export const WEIGHT_QUANTS: { value: QuantName; label: string }[] =
  QUANT_SPECS.map(({ value, label }) => ({ value, label }));

/** Quantization options for the KV cache, ordered from highest to lowest precision. */
export const KV_QUANTS: { value: QuantName; label: string }[] = [
  { value: "bf16", label: "BF16 (default)" },
  { value: "fp16", label: "FP16" },
  { value: "q8_0", label: "Q8_0 (half size)" },
  { value: "q4", label: "Q4 (quarter size)" },
];
