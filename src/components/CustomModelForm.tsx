import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { SiHuggingface } from "react-icons/si";
import { InfoTooltip } from "./InfoTooltip";
import { CapabilityBadges } from "./CapabilityBadges";
import { useHfModelImport } from "@/hooks/useHfModelImport";
import type { ModelConfig, KvFormula, QuantName } from "@/lib/types";

interface CustomModelFormProps {
  value: ModelConfig;
  onChange: (value: ModelConfig) => void;
  /** HuggingFace import field — controlled so it persists in URL state. */
  hfImportUrl: string;
  onHfImportUrlChange: (url: string) => void;
  onImport?:
    | ((
        model: ModelConfig,
        maxK: number,
        detectedPrecision: QuantName | null,
        importedFromUrl: string,
      ) => void)
    | undefined;
  /** URL из внешнего источника (например, вставлен в строку поиска). При изменении автоматически запускает импорт. */
  importUrl?: string | null | undefined;
  onImportUrlConsumed?: (() => void) | undefined;
}

const FORMULA_OPTIONS: { value: KvFormula; label: string }[] = [
  { value: "standard", label: "Standard GQA" },
  { value: "hybrid", label: "Sliding + Full" },
  { value: "mla", label: "MLA" },
  { value: "linear_hybrid", label: "Linear + Full" },
];

export function CustomModelForm({
  value,
  onChange,
  hfImportUrl,
  onHfImportUrlChange,
  onImport,
  importUrl,
  onImportUrlConsumed,
}: CustomModelFormProps) {
  const { loading, error, importedModelId, warning, capabilities, doImport } =
    useHfModelImport({ onImport, onChange });

  const formula = value.kvFormula ?? "standard";

  const updateField = (field: keyof ModelConfig, raw: string) => {
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      onChange({ ...value, [field]: num });
    }
  };

  const setFormula = (f: KvFormula) => {
    onChange({ ...value, kvFormula: f });
  };

  const handleImport = () => doImport(hfImportUrl, value.params);

  useEffect(() => {
    if (!importUrl) return;
    onHfImportUrlChange(importUrl);
    onImportUrlConsumed?.();
    doImport(importUrl, value.params);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importUrl]);

  return (
    <div className="space-y-3">
      {/* HF Import */}
      <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <SiHuggingface className="w-3.5 h-3.5" aria-hidden="true" />
          Import from HuggingFace
          <InfoTooltip content="Paste a HuggingFace model URL to auto-fill architecture parameters from config.json. The original Transformers repo is the most reliable source, but AutoGPTQ / AutoAWQ / MLX forks also work — they ship config.json and we'll auto-detect the quantization from quantization_config or safetensors metadata. Pure llama.cpp GGUF repos have no config.json and aren't supported — import the source Transformers repo and pick the GGUF quant manually." />
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="https://huggingface.co/org/model"
            value={hfImportUrl}
            onChange={(e) => {
              onHfImportUrlChange(e.target.value);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") handleImport(); }}
            className="h-7 text-xs flex-1"
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-3 text-xs shrink-0"
            onClick={handleImport}
            disabled={loading || !hfImportUrl.trim()}
          >
            {loading ? "..." : "Fetch"}
          </Button>
        </div>
        {error && <p className="text-xs text-danger-foreground">{error}</p>}
        {importedModelId && !error && (
          <div className="space-y-1.5">
            <p className="text-xs text-success-foreground">
              Imported: <span className="font-medium">{importedModelId}</span>
            </p>
            <CapabilityBadges caps={capabilities} showLabels />
          </div>
        )}
        {warning && !error && (
          <p className="text-xs text-warning-foreground">{warning}</p>
        )}
      </div>

      {/* Formula selector */}
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Label className="text-xs">KV Cache Formula</Label>
          <InfoTooltip content="Standard GQA: most models (Llama, Qwen 2.5, Mistral, Phi). Sliding + Full (hybrid): Gemma 2/3/4 — alternating sliding-window and full-attention layers. MLA: DeepSeek V2/V3/R1 — single low-rank latent shared by K and V. Linear + Full: Qwen 3.5 — linear-attention layers (fixed-size recurrent state, no KV growth) plus a sparse subset of full-attention layers." />
        </div>
        <div className="flex gap-1" role="radiogroup" aria-label="KV Cache Formula">
          {FORMULA_OPTIONS.map((opt) => {
            const selected = formula === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setFormula(opt.value)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/50 text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Common + formula-specific fields */}
      <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-3">
        {/* Name */}
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <Label className="text-xs">Name</Label>
            <InfoTooltip content="Optional display name for this custom model." />
          </div>
          <Input
            type="text"
            placeholder="e.g. My Custom Model"
            value={value.name ?? ""}
            onChange={(e) => onChange({ ...value, name: e.target.value || undefined })}
            className="h-8 text-sm"
          />
        </div>
        {/* Common: Params + Layers */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label className="text-xs">Parameters</Label>
              <InfoTooltip content="Total parameters in billions. Found in the model name or card. For MoE models this is the TOTAL (all experts)." />
            </div>
            <InputGroup>
              <InputGroupInput
                type="number"
                value={value.params / 1e9}
                onChange={(e) => {
                  const num = parseFloat(e.target.value);
                  if (!isNaN(num)) onChange({ ...value, params: num * 1e9 });
                }}
                className="text-sm"
              />
              <InputGroupAddon align="inline-end">B</InputGroupAddon>
            </InputGroup>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label className="text-xs">Layers</Label>
              <InfoTooltip content="num_hidden_layers in config.json." />
            </div>
            <Input
              type="number"
              value={value.layers}
              onChange={(e) => updateField("layers", e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* MoE toggle + active params.
            Total params drive RAM/disk (all experts stored on disk/in VRAM);
            active params drive TPS (only kA experts read per token). */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={value.moe}
              onChange={(e) => {
                const isMoe = e.target.checked;
                onChange({
                  ...value,
                  moe: isMoe,
                  activeParams: isMoe ? (value.activeParams ?? value.params) : undefined,
                });
              }}
              className="rounded"
              aria-label="Mixture of Experts model"
            />
            Mixture of Experts (MoE)
            <InfoTooltip content="Check this for MoE models (Mixtral, Qwen3 MoE, DeepSeek V3). Total parameters still size the RAM/disk requirements, but only a subset are active per token — which is what drives TPS and value score." />
          </label>
          {value.moe && (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs">Active Parameters</Label>
                <InfoTooltip content="Parameters activated per token. For Mixtral 8x7B: 12.9B. For Qwen3-30B-A3B: 3B. For DeepSeek V3: 37B. Only this fraction is read from VRAM per decode step." />
              </div>
              <InputGroup>
                <InputGroupInput
                  type="number"
                  value={(value.activeParams ?? 0) / 1e9}
                  onChange={(e) => {
                    const num = parseFloat(e.target.value);
                    if (!isNaN(num)) onChange({ ...value, activeParams: num * 1e9 });
                  }}
                  className="text-sm"
                />
                <InputGroupAddon align="inline-end">B</InputGroupAddon>
              </InputGroup>
            </div>
          )}
        </div>

        {/* Standard fields */}
        {formula === "standard" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs">KV Heads</Label>
                <InfoTooltip content="num_key_value_heads in config.json. GQA models have fewer KV heads than query heads." />
              </div>
              <Input type="number" value={value.kvHeads} onChange={(e) => updateField("kvHeads", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs">Head Dim</Label>
                <InfoTooltip content="head_dim in config.json, or hidden_size / num_attention_heads." />
              </div>
              <Input type="number" value={value.headDim} onChange={(e) => updateField("headDim", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
        )}

        {/* Hybrid fields */}
        {formula === "hybrid" && (
          <>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Sliding Attention Layers</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">KV Heads</Label>
                <Input type="number" value={value.kvHeads} onChange={(e) => updateField("kvHeads", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Head Dim</Label>
                <Input type="number" value={value.headDim} onChange={(e) => updateField("headDim", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Window</Label>
                  <InfoTooltip content="sliding_window in config.json. KV cache for sliding layers is capped at this many tokens." />
                </div>
                <Input type="number" value={value.slidingWindow ?? 4096} onChange={(e) => updateField("slidingWindow", e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Full Attention Layers</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Count</Label>
                  <InfoTooltip content="Number of full (global) attention layers. The rest are sliding-window layers." />
                </div>
                <Input type="number" value={value.fullLayers ?? 0} onChange={(e) => updateField("fullLayers", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">KV Heads</Label>
                  <InfoTooltip content="num_global_key_value_heads in config.json for full attention layers." />
                </div>
                <Input type="number" value={value.fullKvHeads ?? value.kvHeads} onChange={(e) => updateField("fullKvHeads", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Head Dim</Label>
                  <InfoTooltip content="head_dim for full (global) attention layers. May differ from sliding layers — Gemma 4 uses 512 here vs. 256 for sliding. Look for global_head_dim in config.json." />
                </div>
                <Input type="number" value={value.fullHeadDim ?? value.headDim} onChange={(e) => updateField("fullHeadDim", e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={(value.kvFactor ?? 2) === 1}
                onChange={(e) => onChange({ ...value, kvFactor: e.target.checked ? 1 : 2 })}
                className="rounded"
              />
              K = V shared (attention_k_eq_v, halves KV cache)
            </label>
          </>
        )}

        {/* MLA fields */}
        {formula === "mla" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs">KV LoRA Rank</Label>
                <InfoTooltip content="kv_lora_rank in config.json. Size of the compressed latent KV representation." />
              </div>
              <Input type="number" value={value.kvLoraRank ?? 512} onChange={(e) => updateField("kvLoraRank", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs">QK Rope Head Dim</Label>
                <InfoTooltip content="qk_rope_head_dim in config.json. RoPE component stored alongside the latent." />
              </div>
              <Input type="number" value={value.qkRopeHeadDim ?? 64} onChange={(e) => updateField("qkRopeHeadDim", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
        )}

        {/* Linear+Full hybrid fields (Qwen 3.5) */}
        {formula === "linear_hybrid" && (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs">Full Attn Layers</Label>
                <InfoTooltip content="Number of full (global) attention layers with traditional KV cache. layer_types: count of 'full_attention' in config.json. In Qwen 3.5 it is layers / 4 (full_attention_interval = 4)." />
              </div>
              <Input type="number" value={value.fullLayers ?? 0} onChange={(e) => updateField("fullLayers", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs">KV Heads</Label>
                <InfoTooltip content="num_key_value_heads in config.json for full attention layers." />
              </div>
              <Input type="number" value={value.kvHeads} onChange={(e) => updateField("kvHeads", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs">Head Dim</Label>
                <InfoTooltip content="head_dim in config.json for full attention layers." />
              </div>
              <Input type="number" value={value.headDim} onChange={(e) => updateField("headDim", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
