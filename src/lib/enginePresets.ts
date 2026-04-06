/**
 * Inference-engine presets shared by the configuration UI (the dropdown in
 * ConcurrentUsersInput) and the documentation block in Footer.tsx.
 *
 * Why a dedicated module:
 * - keeping the source of truth in ONE place avoids label drift between the
 *   dropdown and the "How calculations work" panel;
 * - keeping it OUT of the .tsx file lets `react-refresh` keep working — that
 *   plugin requires component files to only export components.
 */

/** Engine grouping by KV-cache pre-allocation behaviour. */
export interface EnginePreset {
  /** Stable identifier persisted in URL state (`ModelSettings.engineId`). */
  id: string;
  /** Resulting `kvCacheFillPct` (1–100) applied when this preset is picked. */
  pct: number;
  /** Short label shown in the trigger and as the dropdown item title. */
  label: string;
  /** Comma-separated list of engines that share the same KV-cache strategy. */
  engines: string;
  /** One-sentence behaviour description shown in tooltips / Footer cards. */
  description: string;
}

export const ENGINE_PRESETS: readonly EnginePreset[] = [
  {
    id: "llamacpp",
    pct: 100,
    label: "Pre-allocation",
    engines: "llama.cpp · Ollama · MLX",
    description:
      "Full KV cache pre-allocated per slot at startup, regardless of actual prompt length. Worst-case memory but predictable performance — typical for desktop / local inference.",
  },
  {
    id: "vllm",
    pct: 25,
    label: "PagedAttention",
    engines: "vLLM · SGLang · TGI",
    description:
      "Only pages for actual tokens are allocated from a shared pool. ~25% is a typical chatbot fill rate; longer conversations push it higher. The default for production serving.",
  },
  {
    id: "tensorrt",
    pct: 30,
    label: "TensorRT-LLM",
    engines: "Triton + TensorRT-LLM",
    description:
      "NVIDIA's production stack with paged KV cache and CUDA-optimised kernels. Slightly higher fill rate than vLLM in practice due to different page-eviction heuristics.",
  },
];

/** Sentinel value for the "manual KV %" mode in `ModelSettings.engineId`. */
export const CUSTOM_ENGINE_ID = "custom";

function findPresetById(id: string): EnginePreset | null {
  return ENGINE_PRESETS.find((p) => p.id === id) ?? null;
}

function findPresetByPct(pct: number): EnginePreset | null {
  return ENGINE_PRESETS.find((p) => p.pct === pct) ?? null;
}

/**
 * Resolve the currently active preset from the (engineId, kvCacheFillPct) pair.
 *
 * - `engineId === "custom"` → null (force custom mode, even if pct matches)
 * - `engineId` matches a preset AND pct matches that preset → that preset
 * - `engineId` matches a preset BUT pct disagrees → null (de-sync = treat as
 *   custom; this can only happen with a hand-crafted URL, but failing loudly
 *   is better than silently lying with a preset label)
 * - `engineId` undefined (legacy URL) → fall back to matching by pct
 * - unknown id → null
 *
 * This is the one piece of logic that, if broken, silently swaps the dropdown
 * label without anything else looking wrong — hence the dedicated unit tests.
 */
export function resolveActiveEngine(
  engineId: string | undefined,
  kvCacheFillPct: number,
): EnginePreset | null {
  if (engineId === CUSTOM_ENGINE_ID) return null;
  if (engineId !== undefined) {
    const preset = findPresetById(engineId);
    if (!preset) return null;
    return preset.pct === kvCacheFillPct ? preset : null;
  }
  return findPresetByPct(kvCacheFillPct);
}
