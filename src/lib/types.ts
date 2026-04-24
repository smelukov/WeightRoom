export type KvFormula = "standard" | "hybrid" | "mla" | "linear_hybrid";

/** Capabilities of a model detected from config.json or set manually for known models. */
export interface ModelCapabilities {
  /** Model can process images or video alongside text. */
  vlm: boolean;
  /** Model supports extended reasoning / thinking mode. */
  thinking: boolean;
  /** Model supports function / tool calling. */
  toolUse: boolean;
}

export type ModelBrand =
  | "Google"
  | "Alibaba"
  | "Meta"
  | "Mistral"
  | "Microsoft"
  | "DeepSeek";

/**
 * Architecture parameters of a model.
 *
 * Optional fields are declared as `T | undefined` rather than just `?: T`
 * because we deliberately rely on the "set to undefined to clear" pattern
 * (e.g. unchecking the MoE checkbox sets `activeParams: undefined`). Under
 * `exactOptionalPropertyTypes`, plain `?: T` would forbid that and force a
 * verbose `delete`/spread dance at every call site.
 */
export interface ModelConfig {
  name?: string | undefined;
  params: number;
  layers: number;
  kvHeads: number;
  headDim: number;
  moe: boolean;
  activeParams?: number | undefined;
  kvFormula?: KvFormula | undefined;
  // Hybrid (Gemma)
  slidingWindow?: number | undefined;
  fullLayers?: number | undefined;
  fullKvHeads?: number | undefined;
  fullHeadDim?: number | undefined;
  kvFactor?: number | undefined;
  // MLA (DeepSeek)
  kvLoraRank?: number | undefined;
  qkRopeHeadDim?: number | undefined;
}

export interface KnownModel extends ModelConfig {
  displayName: string;
  maxContextK: number;
  brand: ModelBrand;
  /** HuggingFace repo ID, e.g. "meta-llama/Llama-3.1-8B". */
  hfRepoId?: string | undefined;
  /** Optional capability flags for display in the selector and results. */
  capabilities?: ModelCapabilities | undefined;
}

export type QuantName =
  | "fp32"
  | "fp16"
  | "bf16"
  | "q8"
  | "q8_0"
  | "q6_k"
  | "q5_k_m"
  | "q4_k_m"
  | "q4"
  | "q3_k_m"
  | "q2_k"
  | "q1"
  // GPTQ family — calibration-based PTQ for GPU inference (vLLM / ExLlama)
  | "gptq_8bit"
  | "gptq_4bit"
  | "gptq_3bit"
  // AWQ family — activation-aware PTQ for GPU inference (vLLM / AutoAWQ)
  | "awq_4bit"
  // MLX family — Apple Silicon native quantization (mlx_lm.convert)
  | "mlx_8bit"
  | "mlx_4bit"
  | "mlx_3bit"
  | "mlx_2bit";

export interface CalcOptions {
  params: number;
  layers: number;
  kvHeads: number;
  headDim: number;
  contextTokens: number;
  quant: QuantName;
  kvQuant: QuantName;
  moe: boolean;
  activeParams?: number | undefined;
  osOverheadGb: number;
  kvFormula?: KvFormula | undefined;
  // Hybrid
  slidingWindow?: number | undefined;
  fullLayers?: number | undefined;
  fullKvHeads?: number | undefined;
  fullHeadDim?: number | undefined;
  kvFactor?: number | undefined;
  // MLA
  kvLoraRank?: number | undefined;
  qkRopeHeadDim?: number | undefined;
  /**
   * Number of concurrent users / parallel inference slots.
   * KV cache is multiplied by this value. Default: 1.
   */
  concurrentUsers?: number | undefined;
  /**
   * Average KV cache fill percentage (1–100).
   * 100 = llama.cpp full pre-allocation, ~25 = vLLM PagedAttention typical chatbot.
   * Default: 100.
   */
  kvCacheFillPct?: number | undefined;
}

export interface CalcResult {
  weightsGb: number;
  kvCacheGb: number;
  osOverheadGb: number;
  totalGb: number;
}

export interface HostingData {
  price: string;
  /** Number of GPU devices in the instance, e.g. "8" for 8×A100 */
  gpuCount: string;
  /** GPU VRAM per device in GB, e.g. "80" for A100 80GB */
  gpuVram: string;
  /** GPU model name for reference, e.g. "A100", "H100" */
  gpuInfo: string;
  /** GPU memory bandwidth in GB/s, e.g. "1555" for A100 HBM2e */
  gpuBandwidth: string;
  /** Number of CPU cores (vCPUs) */
  cpuCores: string;
  /** Effective CPU frequency in GHz, e.g. "3.6" */
  cpuFreqGHz: string;
  /** CPU model name for reference, e.g. "AMD EPYC 9654", "Apple M1 Max" */
  cpuModel: string;
  /** System RAM bandwidth in GB/s, e.g. DDR4≈50, DDR5≈90, HBM3≈3000 */
  ramBandwidthGBs: string;
  /** RAM type for reference, e.g. "DDR5", "LPDDR5", "HBM3" */
  ramType: string;
  /** Storage type for reference, e.g. "NVMe", "SSD", "HDD" */
  storageType: string;
  /**
   * Bandwidth efficiency factor in % (0–100). Accounts for the gap between
   * theoretical peak bandwidth and what LLM inference actually achieves:
   * non-sequential memory access, dequantization overhead, kernel launch
   * latency, and driver/runtime overhead.
   * Typical values: Apple Silicon ≈ 60%, discrete GPU HBM ≈ 80%, CPU DDR5 ≈ 65%.
   * Default: 80.
   */
  efficiency: string;
  /** Total system RAM available in GB (user input). */
  availableRam: string;
  /** Free disk/SSD space available in GB (user input). */
  availableStorage: string;
  /** RAM reserved for the OS in GB. Default 2 (Linux server). */
  osOverheadGb: number;
  notes: string;
}

/** Model selection and inference settings for a single card. */
export interface ModelSettings {
  modelKey: string | "custom";
  customModel: ModelConfig;
  customMaxK?: number | undefined;
  quant: QuantName;
  kvQuant: QuantName;
  contextK: number;
  /** Number of concurrent users / parallel inference slots. Default: 1. */
  concurrentUsers: number;
  /**
   * Average KV cache fill percentage (1–100). Models how much of the max context
   * window is actually occupied on average.
   * - 100% = llama.cpp / Ollama: full pre-allocation per slot (worst case)
   * - ~25% = vLLM / TGI with PagedAttention: only used pages are allocated
   */
  kvCacheFillPct: number;
  /**
   * Identifier of the selected inference-engine preset (`"llamacpp"`, `"vllm"`,
   * `"tensorrt"`, …) or the literal `"custom"` for a manual `kvCacheFillPct`.
   *
   * Why this exists separately from `kvCacheFillPct`:
   * Two presets could legitimately end up with the same numeric pct (e.g. a
   * future engine also lands on 25%). With pct alone we could not tell which
   * card the user picked, and the dropdown label would silently swap. The
   * `engineId` removes that ambiguity and is the source of truth for the UI.
   *
   * Optional for backward-compatibility with shared URLs created before this
   * field existed — the UI falls back to matching by `kvCacheFillPct` when
   * `engineId` is undefined.
   */
  engineId?: string | undefined;
}

/** Top-level data for one calculator card. */
export interface CardData {
  id: string;
  hfImportUrl?: string | undefined;
  model: ModelSettings;
  hosting: HostingData;
}
