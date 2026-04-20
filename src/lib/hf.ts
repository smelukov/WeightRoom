import type { ModelConfig, KvFormula, ModelCapabilities, QuantName } from "./types";

export type { ModelCapabilities };

export interface HfImportResult {
  model: ModelConfig;
  maxContextK: number;
  /** Full model ID from HF API, e.g. "Qwen/Qwen3-8B". Falls back to repoId. */
  modelId: string;
  /** Warning message when architecture may not be fully supported. */
  warning: string | null;
  /** Capabilities detected from tokenizer_config.json + HF API pipeline_tag. */
  capabilities: ModelCapabilities;
  /**
   * Model precision derived from actual safetensors dtype data — NOT a name guess.
   * Examples: BF16/F16 tensors → "fp16", INT4 tensors → "q4".
   * null when safetensors metadata is unavailable.
   */
  detectedPrecision: QuantName | null;
}

/** Fields we actually use from the HF /api/models endpoint. */
interface HfApiResponse {
  modelId: string;
  /** High-level task type, e.g. "text-generation", "image-text-to-text". */
  pipeline_tag?: string;
  /** Community/automatic tags, e.g. "rwkv", "mamba", "safetensors". */
  tags?: string[];
  /** Safetensors metadata, present when model uses the safetensors format. */
  safetensors?: {
    /** Total parameter count (not bytes). */
    total?: number;
    /** Dtype → parameter count breakdown. Used to detect real model precision. */
    parameters?: Record<string, number>;
  };
}

interface HfConfig {
  // Top-level or nested
  text_config?: HfConfig;
  // Standard fields
  num_hidden_layers?: number;
  num_key_value_heads?: number;
  num_attention_heads?: number;
  head_dim?: number;
  hidden_size?: number;
  max_position_embeddings?: number;
  num_local_experts?: number;
  /** Used by Qwen3 MoE (vs num_local_experts used by Mixtral). */
  num_experts?: number;
  /** Used by DeepSeek V3 (vs num_experts in Qwen3). */
  n_routed_experts?: number;
  /** Number of shared experts that process every token (DeepSeek V3). */
  n_shared_experts?: number;
  num_experts_per_tok?: number;
  /**
   * Intermediate size used INSIDE each expert. Critical for active-param math:
   * a Mixtral expert FFN is (hidden_size × intermediate_size) large, whereas a
   * Qwen3 MoE / DeepSeek expert uses the smaller moe_intermediate_size.
   */
  moe_intermediate_size?: number;
  /** Standard FFN intermediate size (used by dense layers and Mixtral experts). */
  intermediate_size?: number;
  /**
   * DeepSeek V3 places `first_k_dense_replace` dense FFN layers at the start
   * before any MoE routing kicks in. Those layers have no inactive experts,
   * so they must be excluded when computing inactive-param mass.
   */
  first_k_dense_replace?: number;
  model_type?: string;
  architectures?: string[];
  // Hybrid detection
  sliding_window?: number;
  sliding_window_pattern?: number;
  layer_types?: string[];
  attention_k_eq_v?: boolean;
  num_global_key_value_heads?: number;
  global_head_dim?: number;
  // MLA detection
  kv_lora_rank?: number;
  qk_rope_head_dim?: number;
  /**
   * RoPE scaling config. For old-style "linear" scaling (no original_max_position_embeddings),
   * max_position_embeddings is the BASE context — the effective max is base × factor.
   * For newer styles (llama3, yarn, longrope) max_position_embeddings is already the final value.
   */
  rope_scaling?: {
    type?: string;
    factor?: number;
    /** Present in modern models (llama3, yarn) — means max_position_embeddings is already extended. */
    original_max_position_embeddings?: number;
  };
  // Thinking / tool use detection (present when bundled into config.json)
  tokenizer_config?: { chat_template?: string };
  processor_config?: { chat_template?: string };
}

export function parseHfUrl(url: string): string | null {
  // Stop at /, ?, #, or whitespace to avoid including query params or fragments
  const match = url.match(/huggingface\.co\/([^/?#\s]+\/[^/?#\s]+)/);
  // match[1] is `string | undefined` under noUncheckedIndexedAccess. Falling
  // back to null keeps the function's "not a HF URL" contract consistent.
  return match?.[1] ?? null;
}

function guessParamsFromName(repoId: string): number {
  const name = repoId.split("/").pop() ?? "";
  const match = name.match(/(\d+(?:\.\d+)?)\s*[bB]/);
  // match[1] is `string | undefined`. We only enter this branch when the
  // regex matched, so the capture is always defined — `?? "0"` keeps TS
  // happy without changing behaviour.
  if (match) return parseFloat(match[1] ?? "0") * 1e9;
  return 0;
}

/**
 * Pipeline tags that indicate a model is NOT a text-generating LLM.
 * RAM estimates from our calculator will be meaningless for these.
 */
const NON_LLM_PIPELINES = new Set([
  "image-classification",
  "image-segmentation",
  "object-detection",
  "image-to-text",
  "text-to-image",
  "audio-classification",
  "automatic-speech-recognition",
  "depth-estimation",
  "video-classification",
]);

/**
 * HF tags that indicate recurrent / SSM architectures without a traditional
 * KV cache — our calculator cannot produce accurate estimates for them.
 */
const RECURRENT_ARCH_TAGS = new Set([
  "rwkv",
  "mamba",
  "mamba2",
  "jamba",
  "falcon-mamba",
]);

function resolveConfig(raw: HfConfig): HfConfig {
  if (!raw.text_config) return raw;
  return { ...raw, ...raw.text_config };
}

function detectFormula(cfg: HfConfig): KvFormula {
  if (cfg.kv_lora_rank != null) return "mla";
  if (cfg.layer_types?.length) {
    const hasLinear = cfg.layer_types.includes("linear_attention");
    if (hasLinear) return "linear_hybrid";
    return "hybrid";
  }
  if (cfg.sliding_window_pattern != null) return "hybrid";
  if (cfg.sliding_window != null && cfg.num_global_key_value_heads != null) return "hybrid";
  return "standard";
}

/**
 * Detects quantization from safetensors dtype data — NOT from the repo name.
 *
 * Only overrides the selector for models that are ALREADY quantized (INT4, INT8, FP8, U32).
 * Native float precisions (BF16, F16, F32) return null so the user's current planning
 * quantization (e.g. q4_k_m) is preserved — the user decides how they'll deploy it.
 */
function detectPrecisionFromDtype(parameters?: Record<string, number>): QuantName | null {
  if (!parameters) return null;
  // Find the dominant dtype by parameter count
  const dominant = Object.entries(parameters)
    .sort((a, b) => b[1] - a[1])[0]?.[0]
    ?.toUpperCase() ?? "";
  if (!dominant) return null;
  // U32 = MLX 1-bit packed weights (e.g. Bonsai, BitNet MLX variants)
  // Each U32 element packs 32 sign bits — safetensors.total is unreliable here.
  if (dominant === "U32" || dominant === "UINT32") return "q1";
  // FP8 — a quantization format (e.g. DeepSeek V3)
  if (dominant.startsWith("F8") || dominant.startsWith("FP8")) return "q8_0";
  // Integer quantization — AWQ, GPTQ, MLX 4-bit, etc.
  if (dominant === "I4" || dominant === "INT4") return "q4";
  if (dominant === "I8" || dominant === "INT8") return "q8_0";
  // BF16 — native precision on modern GPUs (A100+, H100)
  if (dominant === "BF16") return "bf16";
  // F16 / F32 — unquantized model; user sets their own deployment quantization
  return null;
}

/**
 * Estimate active parameters for a MoE model from HF config fields.
 *
 * Two paths:
 *   • STRUCTURAL (preferred): we compute how much of `totalParams` sits in
 *     inactive experts and subtract it. This is accurate to ~1–5% for modern
 *     gated-SwiGLU MoE (Mixtral, Qwen3 MoE, DeepSeek V3).
 *         expert_size  = 3 · hidden_size · moe_intermediate_size
 *         inactive     = moeLayers · (num_experts − num_active) · expert_size
 *         activeParams = totalParams − inactive
 *     Why "3"? Modern MoE use SwiGLU MLP: gate_proj, up_proj, down_proj —
 *     three matrices per expert, each of shape (hidden_size × intermediate_size).
 *
 *   • CRUDE (fallback): if we lack hidden_size or intermediate_size (rare),
 *     approximate active ≈ total · (k / E). This ignores shared attention /
 *     embedding params, so it under-estimates active params by roughly the
 *     non-MLP fraction (typically 5–15%). Caller gets `isApproximate: true`
 *     and surfaces a warning so the user can override.
 *
 * Returns null when the config does not describe a MoE model at all.
 */
function estimateActiveParams(
  cfg: HfConfig,
  totalParams: number,
  layers: number,
): { value: number; isApproximate: boolean } | null {
  const numExperts =
    cfg.num_local_experts ?? cfg.num_experts ?? cfg.n_routed_experts;
  const numActive = cfg.num_experts_per_tok;
  if (!numExperts || !numActive || numActive >= numExperts) return null;
  if (totalParams <= 0 || layers <= 0) return null;

  const hiddenSize = cfg.hidden_size;
  const expertIntermediate = cfg.moe_intermediate_size ?? cfg.intermediate_size;

  // Fallback: crude ratio k/E. Only MLP scales with experts; attention +
  // embeddings are shared — so this under-estimates by ~5–15%. Clamp floor to
  // avoid physically impossible values (< 1% of total).
  if (!hiddenSize || !expertIntermediate) {
    const ratio = numActive / numExperts;
    const value = Math.max(Math.round(totalParams * ratio), Math.round(totalParams * 0.01));
    return { value, isApproximate: true };
  }

  // Structural path. DeepSeek V3-style configs flag that the first K layers
  // are plain dense MLPs (no experts), so exclude them from the MoE count.
  const denseReplace = cfg.first_k_dense_replace ?? 0;
  const moeLayers = Math.max(0, layers - denseReplace);

  // Shared experts always run, so they're part of active params and must NOT
  // be subtracted. Only subtract "(num_experts - num_active)" routed experts.
  const expertSize = 3 * hiddenSize * expertIntermediate;
  const inactive = moeLayers * (numExperts - numActive) * expertSize;

  const value = totalParams - inactive;
  // Sanity: if our estimate goes negative or wildly exceeds total, fall back
  // to crude. This triggers when config fields are inconsistent with the
  // reported total param count (rare — usually a malformed community upload).
  if (value <= 0 || value > totalParams) {
    const ratio = numActive / numExperts;
    return { value: Math.round(totalParams * ratio), isApproximate: true };
  }
  return { value: Math.round(value), isApproximate: false };
}

function countFullLayers(cfg: HfConfig, totalLayers: number): number {
  if (cfg.layer_types?.length) {
    return cfg.layer_types.filter((t) => t === "full_attention").length;
  }
  if (cfg.sliding_window_pattern != null && cfg.sliding_window_pattern > 0) {
    return Math.floor(totalLayers / cfg.sliding_window_pattern);
  }
  return Math.floor(totalLayers / 2);
}

export async function fetchHfConfig(repoId: string): Promise<HfImportResult> {
  // Three parallel requests:
  //   1. config.json          — architecture params (layers, kvHeads, …)
  //   2. tokenizer_config.json — chat_template for thinking / tool-use detection
  //   3. HF API               — pipeline_tag, tags, modelId, safetensors (params count)
  const [configSettled, tokenizerSettled, apiSettled] = await Promise.allSettled([
    fetch(`https://huggingface.co/${repoId}/resolve/main/config.json`),
    fetch(`https://huggingface.co/${repoId}/resolve/main/tokenizer_config.json`),
    fetch(
      `https://huggingface.co/api/models/${repoId}?expand[]=pipeline_tag&expand[]=tags&expand[]=safetensors`,
    ),
  ]);

  if (configSettled.status === "rejected") {
    throw new Error("Network error — could not reach HuggingFace.");
  }
  const configRes = configSettled.value;
  if (configRes.status === 401)
    throw new Error("This model is gated — access requires authorization.");
  if (configRes.status === 404)
    throw new Error(
      "config.json not found. The model may use a non-standard format (GGUF, RWKV .pth, etc.). Try the original HuggingFace Transformers repo.",
    );
  if (!configRes.ok) throw new Error(`Failed to fetch config: HTTP ${configRes.status}`);

  const raw: HfConfig = await configRes.json();
  const cfg = resolveConfig(raw);

  // tokenizer_config.json is non-critical — skip if not present
  let chatTemplate = "";
  if (tokenizerSettled.status === "fulfilled" && tokenizerSettled.value.ok) {
    const tc = await tokenizerSettled.value.json() as { chat_template?: string };
    chatTemplate = tc.chat_template ?? "";
  }
  // Also check if it's bundled inside config.json (rare but possible)
  if (!chatTemplate) {
    chatTemplate =
      raw.tokenizer_config?.chat_template ??
      raw.processor_config?.chat_template ??
      "";
  }

  // API response is non-critical — we continue even if it fails
  let apiData: HfApiResponse | null = null;
  if (apiSettled.status === "fulfilled" && apiSettled.value.ok) {
    apiData = await apiSettled.value.json();
  }

  const pipelineTag = apiData?.pipeline_tag ?? null;
  const tags: string[] = apiData?.tags ?? [];
  const modelId = apiData?.modelId ?? repoId;

  // ── Warning detection ──────────────────────────────────────────────────
  let warning: string | null = null;

  if (pipelineTag && NON_LLM_PIPELINES.has(pipelineTag)) {
    warning = `This model's task is "${pipelineTag}", not text generation — RAM estimate will be inaccurate.`;
  } else {
    const badTag = tags.find((t) => RECURRENT_ARCH_TAGS.has(t));
    if (badTag) {
      warning = `Tag "${badTag}" indicates a recurrent/SSM architecture without a traditional KV cache — RAM estimate will be inaccurate.`;
    }
  }

  const formula = detectFormula(cfg);
  const layers = cfg.num_hidden_layers ?? 0;
  const kvHeads = cfg.num_key_value_heads ?? cfg.num_attention_heads ?? 0;

  if (!warning && (layers === 0 || kvHeads === 0)) {
    warning = `Could not detect standard LLM architecture fields (layers=${layers}, kv_heads=${kvHeads}). This may be a non-transformer model — RAM estimate will be inaccurate.`;
  }

  const headDim =
    cfg.head_dim ??
    (cfg.hidden_size && cfg.num_attention_heads
      ? Math.round(cfg.hidden_size / cfg.num_attention_heads)
      : 128);
  // num_local_experts = Mixtral; num_experts = Qwen3 MoE; n_routed_experts = DeepSeek V3
  const moe =
    (cfg.num_local_experts ?? cfg.num_experts ?? cfg.n_routed_experts ?? 0) > 0;

  // For old-style linear RoPE scaling (no original_max_position_embeddings),
  // max_position_embeddings is the BASE context — multiply by factor to get effective max.
  // Modern models (llama3, yarn, longrope) already store the extended value in max_position_embeddings.
  const baseMaxPos = cfg.max_position_embeddings ?? 262144;
  const ropeScaling = cfg.rope_scaling;
  const effectiveMaxPos =
    ropeScaling?.type === "linear" &&
    (ropeScaling.factor ?? 1) > 1 &&
    !ropeScaling.original_max_position_embeddings
      ? baseMaxPos * (ropeScaling.factor ?? 1)
      : baseMaxPos;
  const maxContextK = Math.round(effectiveMaxPos / 1024);

  // Detect actual model precision from tensor dtype (not from repo name)
  const detectedPrecision = detectPrecisionFromDtype(apiData?.safetensors?.parameters);

  // For MLX 1-bit (U32-packed), safetensors.total counts packed U32 *elements*, not original weights
  // (each U32 holds 32 sign bits). The reported count is ~40x lower than actual — fall back to name parsing.
  const isU32Packed = detectedPrecision === "q1";
  const params =
    !isU32Packed && apiData?.safetensors?.total != null
      ? apiData.safetensors.total
      : guessParamsFromName(repoId);

  // ── Capabilities ───────────────────────────────────────────────────────
  // VLM: dedicated pipeline tag is the most reliable signal
  const vlm = pipelineTag === "image-text-to-text";

  // Thinking: patterns verified against actual tokenizer_config.json files
  //   enable_thinking  — Qwen3 / Qwen3.5 (confirmed)
  //   reasoning_content — Qwen3 template field name (confirmed)
  //   <think>          — some community reasoning models / R1 distillates
  const thinking =
    chatTemplate.includes("enable_thinking") ||
    chatTemplate.includes("reasoning_content") ||
    chatTemplate.includes("<think>");

  // Tool use: patterns verified against actual tokenizer_config.json files
  //   tool_calls  — OpenAI-compatible format: Qwen, Llama 3.x, Mistral, DeepSeek (confirmed)
  //   <tool_code> — Gemma 3 IT format
  const toolUse =
    chatTemplate.includes("tool_calls") ||
    chatTemplate.includes("<tool_code>");

  const capabilities: ModelCapabilities = { vlm, thinking, toolUse };

  // ── Estimate activeParams for MoE models ──────────────────────────────
  // This matters for TPS/value-score: calcValueScore uses activeParams (not
  // total params) for bandwidth calculation on MoE models. Without this,
  // imported MoE models would be scored as if they were dense — wildly
  // underestimating their TPS.
  const activeEstimate = moe ? estimateActiveParams(cfg, params, layers) : null;
  if (moe && activeEstimate?.isApproximate) {
    const warn =
      "MoE active parameters estimated roughly from k/E ratio — verify the value against the model card.";
    warning = warning ? `${warning} ${warn}` : warn;
  }

  // ── Build ModelConfig ──────────────────────────────────────────────────
  const model: ModelConfig = {
    params,
    layers,
    kvHeads,
    headDim,
    moe,
    kvFormula: formula,
  };
  if (activeEstimate) {
    model.activeParams = activeEstimate.value;
  }

  if (formula === "hybrid") {
    model.fullLayers = countFullLayers(cfg, layers);
    model.slidingWindow = cfg.sliding_window ?? 4096;
    if (cfg.num_global_key_value_heads != null) {
      model.fullKvHeads = cfg.num_global_key_value_heads;
    }
    if (cfg.global_head_dim != null) {
      model.fullHeadDim = cfg.global_head_dim;
    }
    if (cfg.attention_k_eq_v) {
      model.kvFactor = 1;
    }
  }

  if (formula === "linear_hybrid") {
    model.fullLayers = countFullLayers(cfg, layers);
  }

  if (formula === "mla") {
    // Both fields are optional in `HfConfig` (`number | undefined`). Under
    // exactOptionalPropertyTypes we can't assign `undefined` to an optional
    // property, so guard with `?? 0` (MLA without these fields wouldn't be
    // useful anyway — we'd just get a degenerate config).
    model.kvLoraRank = cfg.kv_lora_rank ?? 0;
    model.qkRopeHeadDim = cfg.qk_rope_head_dim ?? 0;
  }

  // Active parameters for MoE: critical for accurate TPS. Must be estimated
  // after `params` and `layers` are known and after the `moe` flag is set.
  if (moe) {
    const estimate = estimateActiveParams(cfg, params, layers);
    if (estimate) {
      model.activeParams = estimate.value;
      if (estimate.isApproximate && !warning) {
        warning = `MoE active parameters estimated from the expert-count ratio (config missing hidden_size / moe_intermediate_size). TPS accuracy is reduced — verify the value in the Custom model form.`;
      }
    }
  }

  return { model, maxContextK, modelId, warning, capabilities, detectedPrecision };
}
