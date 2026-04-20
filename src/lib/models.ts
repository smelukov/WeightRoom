import type {
  KnownModel,
  ModelBrand,
  ModelCapabilities,
} from "./types";

export const MODEL_BRANDS: { key: ModelBrand; label: string }[] = [
  { key: "Google", label: "Google" },
  { key: "Alibaba", label: "Alibaba" },
  { key: "Meta", label: "Meta" },
  { key: "Mistral", label: "Mistral AI" },
  { key: "Microsoft", label: "Microsoft" },
  { key: "DeepSeek", label: "DeepSeek" },
];

export const KNOWN_MODELS: Record<string, KnownModel> = {
  // ── Google Gemma (hybrid) ──────────────────────────────────────────
  "gemma2-9b": {
    displayName: "Gemma 2 9B",
    brand: "Google",
    hfRepoId: "google/gemma-2-9b",
    params: 9e9,
    layers: 42,
    kvHeads: 4,
    headDim: 256,
    kvFormula: "hybrid",
    fullLayers: 21,
    slidingWindow: 4096,
    moe: false,
    maxContextK: 8,
  },
  "gemma3-4b": {
    displayName: "Gemma 3 4B",
    brand: "Google",
    hfRepoId: "google/gemma-3-4b-it",
    params: 4e9,
    layers: 34,
    kvHeads: 4,
    headDim: 256,
    kvFormula: "hybrid",
    fullLayers: 5,
    slidingWindow: 1024,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: true, thinking: false, toolUse: true },
  },
  "gemma3-12b": {
    displayName: "Gemma 3 12B",
    brand: "Google",
    hfRepoId: "google/gemma-3-12b-it",
    params: 12e9,
    layers: 48,
    kvHeads: 4,
    headDim: 256,
    kvFormula: "hybrid",
    fullLayers: 8,
    slidingWindow: 1024,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: true, thinking: false, toolUse: true },
  },
  "gemma3-27b": {
    displayName: "Gemma 3 27B",
    brand: "Google",
    hfRepoId: "google/gemma-3-27b-it",
    params: 27e9,
    layers: 62,
    kvHeads: 16,
    headDim: 128,
    kvFormula: "hybrid",
    fullLayers: 10,
    slidingWindow: 1024,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: true, thinking: false, toolUse: true },
  },
  // Gemma 4 introduces attention_k_eq_v on the dense 31B and the MoE variant:
  // K and V tensors share storage, halving the KV cache. We model this with
  // kvFactor: 1 (default is 2 for separate K and V).
  "gemma4-e2b": {
    displayName: "Gemma 4 E2B",
    brand: "Google",
    hfRepoId: "google/gemma-4-E2B-it",
    params: 5.1e9,
    layers: 35,
    kvHeads: 1,
    headDim: 256,
    kvFormula: "hybrid",
    fullLayers: 7,
    fullKvHeads: 1,
    fullHeadDim: 512,
    slidingWindow: 512,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: true, thinking: true, toolUse: true },
  },
  "gemma4-e4b": {
    displayName: "Gemma 4 E4B",
    brand: "Google",
    hfRepoId: "google/gemma-4-E4B-it",
    params: 8e9,
    layers: 42,
    kvHeads: 2,
    headDim: 256,
    kvFormula: "hybrid",
    fullLayers: 7,
    fullKvHeads: 2,
    fullHeadDim: 512,
    slidingWindow: 512,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: true, thinking: true, toolUse: true },
  },
  "gemma4-26b-a4b": {
    displayName: "Gemma 4 26B-A4B (MoE)",
    brand: "Google",
    hfRepoId: "google/gemma-4-26B-A4B-it",
    params: 25.2e9,
    activeParams: 3.8e9,
    layers: 30,
    kvHeads: 8,
    headDim: 256,
    kvFormula: "hybrid",
    fullLayers: 5,
    fullKvHeads: 2,
    fullHeadDim: 512,
    slidingWindow: 1024,
    kvFactor: 1,
    moe: true,
    maxContextK: 256,
    capabilities: { vlm: true, thinking: true, toolUse: true },
  },
  "gemma4-31b": {
    displayName: "Gemma 4 31B",
    brand: "Google",
    hfRepoId: "google/gemma-4-31B-it",
    params: 30.7e9,
    layers: 60,
    kvHeads: 16,
    headDim: 256,
    kvFormula: "hybrid",
    fullLayers: 10,
    fullKvHeads: 4,
    fullHeadDim: 512,
    slidingWindow: 1024,
    kvFactor: 1,
    moe: false,
    maxContextK: 256,
    capabilities: { vlm: true, thinking: true, toolUse: true },
  },
  // ── Qwen (standard) ───────────────────────────────────────────────
  "qwen2.5-7b": {
    displayName: "Qwen 2.5 7B",
    brand: "Alibaba",
    hfRepoId: "Qwen/Qwen2.5-7B",
    params: 7e9,
    layers: 28,
    kvHeads: 4,
    headDim: 128,
    moe: false,
    maxContextK: 128,
  },
  "qwen2.5-72b": {
    displayName: "Qwen 2.5 72B",
    brand: "Alibaba",
    hfRepoId: "Qwen/Qwen2.5-72B",
    params: 72e9,
    layers: 80,
    kvHeads: 8,
    headDim: 128,
    moe: false,
    maxContextK: 128,
  },
  "qwen3.5-9b": {
    displayName: "Qwen 3.5 9B",
    brand: "Alibaba",
    hfRepoId: "Qwen/Qwen3.5-9B",
    params: 9e9,
    layers: 32,
    kvHeads: 4,
    headDim: 256,
    kvFormula: "linear_hybrid",
    fullLayers: 8,
    moe: false,
    maxContextK: 256,
    capabilities: { vlm: true, thinking: true, toolUse: true },
  },
  "qwen3.5-27b": {
    displayName: "Qwen 3.5 27B",
    brand: "Alibaba",
    hfRepoId: "Qwen/Qwen3.5-27B",
    params: 27e9,
    layers: 64,
    kvHeads: 4,
    headDim: 256,
    kvFormula: "linear_hybrid",
    fullLayers: 16,
    moe: false,
    maxContextK: 256,
    capabilities: { vlm: true, thinking: true, toolUse: true },
  },
  "qwen3.5-35b-a3b": {
    displayName: "Qwen 3.5 35B-A3B (MoE)",
    brand: "Alibaba",
    hfRepoId: "Qwen/Qwen3.5-35B-A3B",
    params: 35e9,
    layers: 40,
    kvHeads: 2,
    headDim: 256,
    kvFormula: "linear_hybrid",
    fullLayers: 10,
    moe: true,
    activeParams: 3e9,
    maxContextK: 256,
    capabilities: { vlm: true, thinking: true, toolUse: true },
  },
  // ── Qwen 3 (standard, thinking) ───────────────────────────────────
  "qwen3-4b": {
    displayName: "Qwen 3 4B",
    brand: "Alibaba",
    hfRepoId: "Qwen/Qwen3-4B",
    params: 4.02e9,
    layers: 36,
    kvHeads: 8,
    headDim: 128,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: false, thinking: true, toolUse: true },
  },
  "qwen3-8b": {
    displayName: "Qwen 3 8B",
    brand: "Alibaba",
    hfRepoId: "Qwen/Qwen3-8B",
    params: 8.19e9,
    layers: 36,
    kvHeads: 8,
    headDim: 128,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: false, thinking: true, toolUse: true },
  },
  "qwen3-32b": {
    displayName: "Qwen 3 32B",
    brand: "Alibaba",
    hfRepoId: "Qwen/Qwen3-32B",
    params: 32.76e9,
    layers: 64,
    kvHeads: 8,
    headDim: 128,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: false, thinking: true, toolUse: true },
  },
  "qwen3-235b-a22b": {
    displayName: "Qwen 3 235B-A22B (MoE)",
    brand: "Alibaba",
    hfRepoId: "Qwen/Qwen3-235B-A22B",
    params: 235e9,
    layers: 94,
    kvHeads: 4,
    headDim: 128,
    moe: true,
    activeParams: 22e9,
    maxContextK: 128,
    capabilities: { vlm: false, thinking: true, toolUse: true },
  },
  // ── Meta Llama (standard) ──────────────────────────────────────────
  "llama3.2-3b": {
    displayName: "Llama 3.2 3B",
    brand: "Meta",
    hfRepoId: "meta-llama/Llama-3.2-3B",
    params: 3.21e9,
    layers: 28,
    kvHeads: 8,
    headDim: 128,
    moe: false,
    maxContextK: 128,
  },
  "llama3.1-8b": {
    displayName: "Llama 3.1 8B",
    brand: "Meta",
    hfRepoId: "meta-llama/Llama-3.1-8B",
    params: 8e9,
    layers: 32,
    kvHeads: 8,
    headDim: 128,
    moe: false,
    maxContextK: 128,
  },
  "llama3.3-70b": {
    displayName: "Llama 3.3 70B Instruct",
    brand: "Meta",
    hfRepoId: "meta-llama/Llama-3.3-70B-Instruct",
    params: 70.55e9,
    layers: 80,
    kvHeads: 8,
    headDim: 128,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: false, thinking: false, toolUse: true },
  },
  "llama3.1-405b": {
    displayName: "Llama 3.1 405B",
    brand: "Meta",
    hfRepoId: "meta-llama/Llama-3.1-405B",
    params: 405e9,
    layers: 126,
    kvHeads: 8,
    headDim: 128,
    moe: false,
    maxContextK: 128,
  },
  // ── Mistral (standard) ────────────────────────────────────────────
  "mistral-nemo-12b": {
    displayName: "Mistral NeMo 12B Instruct",
    brand: "Mistral",
    hfRepoId: "mistralai/Mistral-Nemo-Instruct-2407",
    params: 12.248e9,
    layers: 40,
    kvHeads: 8,
    headDim: 128,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: false, thinking: false, toolUse: true },
  },
  "mistral-7b": {
    displayName: "Mistral 7B",
    brand: "Mistral",
    hfRepoId: "mistralai/Mistral-7B-v0.1",
    params: 7.3e9,
    layers: 32,
    kvHeads: 8,
    headDim: 128,
    moe: false,
    maxContextK: 32,
  },
  "mistral-small-24b": {
    displayName: "Mistral Small 3 24B Instruct",
    brand: "Mistral",
    hfRepoId: "mistralai/Mistral-Small-24B-Instruct-2501",
    params: 24e9,
    layers: 40,
    kvHeads: 8,
    headDim: 128,
    moe: false,
    maxContextK: 32,
    capabilities: { vlm: false, thinking: false, toolUse: true },
  },
  "mixtral-8x7b": {
    displayName: "Mixtral 8x7B-A13B (MoE)",
    brand: "Mistral",
    hfRepoId: "mistralai/Mixtral-8x7B-v0.1",
    params: 46.7e9,
    layers: 32,
    kvHeads: 8,
    headDim: 128,
    moe: true,
    activeParams: 12.9e9,
    maxContextK: 32,
  },
  "mixtral-8x22b": {
    displayName: "Mixtral 8x22B-A39B (MoE)",
    brand: "Mistral",
    hfRepoId: "mistralai/Mixtral-8x22B-v0.1",
    params: 141e9,
    layers: 56,
    kvHeads: 8,
    headDim: 128,
    moe: true,
    activeParams: 39e9,
    maxContextK: 64,
  },
  // ── Microsoft Phi (standard) ──────────────────────────────────────
  "phi-3.5-mini": {
    displayName: "Phi-3.5 Mini Instruct 3.8B",
    brand: "Microsoft",
    hfRepoId: "microsoft/Phi-3.5-mini-instruct",
    params: 3.8e9,
    layers: 32,
    kvHeads: 8,
    headDim: 96,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: false, thinking: false, toolUse: true },
  },
  "phi-4": {
    displayName: "Phi-4 14B",
    brand: "Microsoft",
    hfRepoId: "microsoft/phi-4",
    params: 14e9,
    layers: 40,
    kvHeads: 10,
    headDim: 128,
    moe: false,
    maxContextK: 16,
    capabilities: { vlm: false, thinking: false, toolUse: true },
  },
  // ── DeepSeek (standard + MLA) ─────────────────────────────────────
  "deepseek-r1-distill-7b": {
    displayName: "DeepSeek R1 Distill 7B",
    brand: "DeepSeek",
    hfRepoId: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
    params: 7.62e9,
    layers: 28,
    kvHeads: 4,
    headDim: 128,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: false, thinking: true, toolUse: false },
  },
  "deepseek-r1-distill-14b": {
    displayName: "DeepSeek R1 Distill 14B",
    brand: "DeepSeek",
    hfRepoId: "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B",
    params: 14.77e9,
    layers: 48,
    kvHeads: 4,
    headDim: 128,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: false, thinking: true, toolUse: false },
  },
  "deepseek-r1-distill-32b": {
    displayName: "DeepSeek R1 Distill 32B",
    brand: "DeepSeek",
    hfRepoId: "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
    params: 32.76e9,
    layers: 64,
    kvHeads: 8,
    headDim: 128,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: false, thinking: true, toolUse: false },
  },
  "deepseek-r1-distill-70b": {
    displayName: "DeepSeek R1 Distill 70B",
    brand: "DeepSeek",
    hfRepoId: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B",
    params: 70.55e9,
    layers: 80,
    kvHeads: 8,
    headDim: 128,
    moe: false,
    maxContextK: 128,
    capabilities: { vlm: false, thinking: true, toolUse: false },
  },
  "deepseek-v3": {
    displayName: "DeepSeek V3 671B-A37B (MoE)",
    brand: "DeepSeek",
    hfRepoId: "deepseek-ai/DeepSeek-V3",
    params: 671e9,
    layers: 61,
    kvHeads: 0,
    headDim: 0,
    kvFormula: "mla",
    kvLoraRank: 512,
    qkRopeHeadDim: 64,
    moe: true,
    activeParams: 37e9,
    maxContextK: 128,
    capabilities: { vlm: false, thinking: false, toolUse: true },
  },
  "deepseek-r1": {
    displayName: "DeepSeek R1 671B-A37B (MoE)",
    brand: "DeepSeek",
    hfRepoId: "deepseek-ai/DeepSeek-R1",
    params: 671e9,
    layers: 61,
    kvHeads: 0,
    headDim: 0,
    kvFormula: "mla",
    kvLoraRank: 512,
    qkRopeHeadDim: 64,
    moe: true,
    activeParams: 37e9,
    maxContextK: 128,
    capabilities: { vlm: false, thinking: true, toolUse: false },
  },
};

export function getModelsByBrand(): {
  brand: ModelBrand;
  label: string;
  models: [string, KnownModel][];
}[] {
  return MODEL_BRANDS.map(({ key, label }) => ({
    brand: key,
    label,
    models: Object.entries(KNOWN_MODELS)
      .filter(([, m]) => m.brand === key)
      .sort(([, a], [, b]) => a.params - b.params),
  }));
}

/** Item for Combobox — a single selectable model option. */
export interface ModelOption {
  key: string;
  displayName: string;
  /** Brand used to show a vendor icon. Undefined for the custom option. */
  brand?: ModelBrand | undefined;
  /** Capability flags for display in the selector. Undefined for the custom option. */
  capabilities?: ModelCapabilities | undefined;
}

/** Group of models for grouped Combobox rendering. */
export interface ModelGroup {
  value: string;
  items: ModelOption[];
}

/**
 * Stable singleton: model groups + a flat lookup map.
 * All ModelOption objects are shared between the groups array and the lookup,
 * so Combobox can compare them by reference.
 */
const { groups: MODEL_GROUPS_SINGLETON, optionsByKey: OPTIONS_BY_KEY } =
  (() => {
    const optionsByKey = new Map<string, ModelOption>();

    const groups: ModelGroup[] = MODEL_BRANDS.map(({ key, label }) => ({
      value: label,
      items: Object.entries(KNOWN_MODELS)
        .filter(([, m]) => m.brand === key)
        .sort(([, a], [, b]) => a.params - b.params)
        .map(([k, m]) => {
          const opt: ModelOption = {
            key: k,
            displayName: m.displayName,
            brand: m.brand,
            capabilities: m.capabilities,
          };
          optionsByKey.set(k, opt);
          return opt;
        }),
    }));

    const customOpt: ModelOption = {
      key: "custom",
      displayName: "Custom model...",
    };
    optionsByKey.set("custom", customOpt);
    groups.push({ value: "Other", items: [customOpt] });

    return { groups, optionsByKey };
  })();

/** All model groups including "Other" with the custom option. */
export function getModelGroups(): ModelGroup[] {
  return MODEL_GROUPS_SINGLETON;
}

/** Find the stable ModelOption reference by key. Returns null if not found. */
export function findModelOption(key: string): ModelOption | null {
  return OPTIONS_BY_KEY.get(key) ?? null;
}

export { QUANT_BITS, WEIGHT_QUANTS, KV_QUANTS } from "./quants";
