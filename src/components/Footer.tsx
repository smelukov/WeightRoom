import { useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import { KV_FORMULA_DETAILS } from "@/lib/kvFormulas";

// NOTE: When you change a formula in src/lib/calculator.ts, update the
// matching FormulaBlock / FormulaCard below. The footer is the only place
// where the math is exposed to end-users — drift here means users will
// scratch their heads at numbers they can't reproduce.
// KV-cache formula descriptions live in `src/lib/kvFormulas.ts` so the
// in-card tooltip and this footer stay in sync.

export function Footer() {
  const [open, setOpen] = useState(false);

  return (
    <footer className="mt-auto border-t border-border">
      <div className="max-w-3xl mx-auto px-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full py-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={open}
          aria-controls="methodology-panel"
        >
          <span>How calculations work</span>
          <LuChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>

        <div
          id="methodology-panel"
          className={`grid transition-[grid-template-rows] duration-300 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        >
          <div className="overflow-hidden">
            <div className="pb-6 space-y-4 text-xs text-muted-foreground">
              {/* Total RAM */}
              <FormulaBlock
                title="Total RAM"
                formula="Weights + KV Cache + OS Overhead"
                note="OS Overhead defaults to 2 GB (Linux). Adjust in the hardware panel: macOS / Windows ≈ 6 GB, iOS ≈ 2 GB."
              />

              {/* Weights */}
              <FormulaBlock
                title="Weights"
                formula="Params × (bits / 8) × 1.1"
                note="The ×1.1 factor accounts for tensors that are NOT quantized (token embeddings, layer norms, lm_head). Special case: Q1 uses ×1.0 because its bits-per-weight (1.25) already includes the per-group scale-factor overhead."
              />

              {/* KV Cache */}
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-foreground">
                  KV Cache (depends on architecture)
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  T = context tokens, L = layers, KV_H = num_key_value_heads, H_D = head_dim,
                  bytes = KV-cache element size (e.g. 2 for FP16). Multiplied by concurrent users × fill %.
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {(
                    Object.entries(KV_FORMULA_DETAILS) as Array<
                      [keyof typeof KV_FORMULA_DETAILS, (typeof KV_FORMULA_DETAILS)[keyof typeof KV_FORMULA_DETAILS]]
                    >
                  ).map(([key, info]) => (
                    <FormulaCard
                      key={key}
                      label={info.label}
                      models={info.models}
                      formula={info.formula}
                      note={info.note}
                    />
                  ))}
                </div>
              </div>

              {/* KV cache fill % per engine */}
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-foreground">
                  KV cache fill % (engine pre-allocation behaviour)
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  The KV-cache term above is multiplied by{" "}
                  <code className="bg-secondary px-1 rounded">fill_pct / 100</code> to
                  model how much of the context window your inference engine actually
                  reserves per slot. Pick the closest preset, or set a custom value if
                  your workload is unusual.
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  <FormulaCard
                    label="Pre-allocation · 100%"
                    models="llama.cpp · Ollama · MLX"
                    formula="full context reserved per slot"
                    note="Full KV cache pre-allocated at startup, regardless of actual prompt length. Worst-case memory but predictable performance — typical for desktop/local inference."
                  />
                  <FormulaCard
                    label="PagedAttention · 25%"
                    models="vLLM · SGLang · TGI"
                    formula="pages allocated from a shared pool"
                    note="Only pages for actual tokens are allocated. ~25% is a typical chatbot fill rate; longer conversations push it higher. The default for production serving."
                  />
                  <FormulaCard
                    label="TensorRT-LLM · 30%"
                    models="Triton + TensorRT-LLM"
                    formula="paged KV + CUDA-optimised kernels"
                    note="NVIDIA's production stack with paged KV cache. Slightly higher fill rate than vLLM in practice due to different page-eviction heuristics."
                  />
                  <FormulaCard
                    label="Custom · 1–100%"
                    models="Manual override"
                    formula="user-supplied fill_pct"
                    note="Use this for unusual engines, long-context workloads, or to model a specific load profile. Shared via URL state, so estimates are reproducible."
                  />
                </div>
              </div>

              {/* MoE */}
              <FormulaBlock
                title="MoE: total vs active parameters"
                formula="RAM uses TOTAL params · TPS uses ACTIVE params"
                note="Mixture-of-Experts models (Mixtral, Qwen3-30B-A3B, DeepSeek V3, Llama 4) keep ALL experts in RAM, but only a small subset is read per token. Without this distinction TPS would be under-estimated up to ~10× — e.g. DeepSeek V3 (671B total / 37B active) reads only the 37B per token despite needing 671B of RAM."
              />

              {/* TPS */}
              <FormulaBlock
                title="TPS (tokens / second, per user)"
                formula="effective_BW / (active_params × bytes/param × 1.1 + KV_traffic)"
                note="effective_BW = (GPUs × GPU_BW or RAM_BW) × efficiency (default 0.8). KV_traffic per decode step = read all cached K/V for prior tokens + write the new one — uses the same architecture-specific formula as above. With N concurrent users, KV_traffic is multiplied by N (per-user bandwidth shrinks accordingly)."
              />

              {/* Storage */}
              <FormulaBlock
                title="Storage"
                formula="Params × (bits / 8) × 1.05  +  20 GB OS"
                note="The ×1.05 is the on-disk equivalent of the ×1.1 RAM overhead — slightly smaller because the embeddings / lm_head are typically saved at lower precision than they're loaded with at runtime, and tokenizer / config files contribute a fraction of a percent. Applies uniformly to GGUF, GPTQ, AWQ, MLX and float checkpoints. OS overhead covers a minimal Linux installation."
              />

              {/* Limitations / accuracy of TPS estimates */}
              <div className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
                <div className="text-[11px] font-medium text-foreground">
                  Limitations &mdash; treat TPS as an upper bound
                </div>
                <p className="text-[10px] text-muted-foreground/90">
                  TPS is computed from a <strong>roof-line model</strong>: it
                  assumes inference is purely bandwidth-bound (the GPU spends
                  100% of its time streaming weights and KV cache from memory).
                  Real engines never quite reach that limit. Specifically, the
                  numbers <em>do not</em> account for:
                </p>
                <ul className="text-[10px] text-muted-foreground/90 list-disc pl-4 space-y-0.5">
                  <li>
                    Compute-bound phases (prefill, attention math) &mdash; only
                    the decode step is modelled.
                  </li>
                  <li>
                    Multi-GPU overhead &mdash; tensor / pipeline parallel
                    collectives, NVLink synchronisation, all-reduce latency.
                  </li>
                  <li>
                    MoE expert routing latency and load imbalance across GPUs.
                  </li>
                  <li>
                    Kernel launch overhead, dequantisation cost, scheduler /
                    runtime overhead.
                  </li>
                </ul>
                <p className="text-[10px] text-muted-foreground/90">
                  Rule of thumb &mdash; real throughput is typically:
                </p>
                <ul className="text-[10px] text-muted-foreground/90 list-disc pl-4 space-y-0.5">
                  <li>
                    <strong>60&ndash;90%</strong> of estimate for dense models on
                    a single GPU
                  </li>
                  <li>
                    <strong>40&ndash;60%</strong> for multi-GPU dense (tensor
                    parallel)
                  </li>
                  <li>
                    <strong>20&ndash;40%</strong> for multi-GPU MoE (DeepSeek V3,
                    Mixtral &times;N)
                  </li>
                </ul>
                <p className="text-[10px] text-muted-foreground/70 italic">
                  Use the numbers for sizing decisions ("does this fit?", "is
                  config A faster than config B?"), not as a substitute for real
                  benchmarks.
                </p>
              </div>

              {/* Supported formats */}
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-foreground">
                  Supported model formats
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <FormulaCard
                    label="HF Transformers"
                    models="Full-precision BF16/FP16/FP32"
                    formula="config.json + safetensors"
                    note="Fully supported. Pick any quantization manually after import."
                  />
                  <FormulaCard
                    label="GPTQ / AWQ"
                    models="AutoGPTQ, AutoAWQ, TheBloke -GPTQ / -AWQ"
                    formula="quantization_config in config.json"
                    note="Auto-detected when quantization_config sets quant_method=gptq (3/4/8 bit) or awq (4 bit). Engine list filters down to vLLM / TensorRT-LLM."
                  />
                  <FormulaCard
                    label="MLX (Apple Silicon)"
                    models="mlx-community/* and 'mlx' tag"
                    formula="INT4 / INT8 dtype + repo metadata"
                    note="Auto-detected by the mlx-community/ org prefix or the 'mlx' tag. 1-bit U32 packing may misreport param count — import the original repo instead."
                  />
                  <FormulaCard
                    label="GGUF (llama.cpp)"
                    models="TheBloke, bartowski, etc."
                    formula="No config.json — ❌ not supported"
                    note="Import the original HF Transformers repo, then select quantization manually."
                  />
                  <FormulaCard
                    label="Q1_0 (1-bit)"
                    models="Bonsai, BitNet b1.58, etc."
                    formula="Params × (1.25 / 8) × 1.0"
                    note="GGUF Q1_0 ≈ 1.125 bpw, MLX 1-bit ≈ 1.25 bpw — both include per-group scale factors. We use the more conservative MLX value, which may slightly over-estimate GGUF-only deployments."
                  />
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground">
                Architecture parameters are pulled from HuggingFace{" "}
                <code className="bg-muted px-1 rounded">config.json</code>.
                Use <code className="bg-muted px-1 rounded">num_key_value_heads</code>{" "}
                (not total heads) for GQA models. For MoE, active params are estimated from{" "}
                <code className="bg-muted px-1 rounded">num_experts_per_tok</code> ×{" "}
                <code className="bg-muted px-1 rounded">moe_intermediate_size</code> when available,
                otherwise from a ratio heuristic.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FormulaBlock({
  title,
  formula,
  note,
}: {
  title: string;
  formula: string;
  note?: string;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium text-foreground">{title}</div>
      <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded inline-block mt-0.5">
        {formula}
      </code>
      {note && <p className="text-[10px] text-muted-foreground mt-0.5">{note}</p>}
    </div>
  );
}

function FormulaCard({
  label,
  models,
  formula,
  note,
}: {
  label: string;
  models: string;
  formula: string;
  note?: string;
}) {
  return (
    <div className="rounded-md bg-muted border border-border p-2 space-y-0.5">
      <div className="text-[11px] font-medium text-foreground leading-tight">{label}</div>
      <div className="text-[10px] text-muted-foreground">{models}</div>
      <code className="text-[10px] bg-background/60 px-1 py-0.5 rounded inline-block">
        {formula}
      </code>
      {note && <p className="text-[10px] text-muted-foreground">{note}</p>}
    </div>
  );
}
