import type { KvFormula } from "./types";

/**
 * Human-readable metadata for each KV-cache formula. A single source of
 * truth so the footer reference table and the in-card formula tooltip
 * stay in sync — if you change the wording here it propagates everywhere.
 *
 * - `label`     short name shown on the badge.
 * - `models`    families that use this formula (used in footer cards).
 * - `formula`   compact mathematical form.
 * - `note`      one-paragraph plain-language explanation.
 */
export interface KvFormulaInfo {
  readonly label: string;
  readonly models: string;
  readonly formula: string;
  readonly note: string;
}

export const KV_FORMULA_DETAILS: Record<KvFormula, KvFormulaInfo> = {
  standard: {
    label: "Standard GQA",
    models: "Llama, Qwen 2.5, Mistral, Phi",
    formula: "2 × L × KV_H × H_D × T × bytes",
    note: "The ×2 stores K and V separately. KV cache grows linearly with context length.",
  },
  hybrid: {
    label: "Sliding Window (hybrid)",
    models: "Gemma 2 / 3 / 4",
    formula: "sliding_layers × … × min(T, W) + full_layers × … × T",
    note: "Local-attention layers cap memory at W (sliding window, e.g. 4096). Only every Nth layer keeps a full cache. Gemma 4 dense 31B and the MoE 26B variant share K and V storage, halving the KV cache.",
  },
  mla: {
    label: "MLA",
    models: "DeepSeek V2 / V3 / R1",
    formula: "L × (kv_lora_rank + qk_rope_dim) × T × bytes",
    note: "No ×2 — K and V share a single low-rank latent projection. ~10–20× smaller than standard GQA at the same context length.",
  },
  linear_hybrid: {
    label: "Linear + Full",
    models: "Qwen 3.5",
    formula: "2 × full_layers × KV_H × H_D × T × bytes",
    note: "Linear-attention layers use a fixed-size recurrent state (≈0 memory). Only the sparse full-attention layers grow with T.",
  },
};
