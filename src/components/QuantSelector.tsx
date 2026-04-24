import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "./InfoTooltip";
import {
  KV_QUANTS,
  QUANT_SPECS,
  getWeightQuantGroups,
} from "@/lib/quants";
import type { QuantName } from "@/lib/types";

interface QuantSelectorProps {
  quant: QuantName;
  kvQuant: QuantName;
  onQuantChange: (value: QuantName) => void;
  onKvQuantChange: (value: QuantName) => void;
}

const WEIGHT_QUANT_GROUPS = getWeightQuantGroups();

const WEIGHTS_TOOLTIP = `Bits per model weight, grouped by format family:

• Float (FP32/BF16/FP16) — training precision, runs anywhere.
• GGUF (Q*_K_M, Q8_0…) — universal CPU/GPU/Mac via llama.cpp / Ollama.
• MLX (g64) — Apple Silicon native quantization.
• GPTQ (g128) — calibration-based PTQ for GPU (vLLM, ExLlama).
• AWQ 4-bit (g128) — activation-aware PTQ for GPU (vLLM, AutoAWQ).

Lower bits = smaller model but slightly worse quality. Q4 / GPTQ-4bit / AWQ-4bit are the most popular choices for production inference.`;

function getQuantLabel(value: QuantName): string {
  return QUANT_SPECS.find((q) => q.value === value)?.label ?? value;
}

function getKvQuantLabel(value: QuantName): string {
  return KV_QUANTS.find((q) => q.value === value)?.label ?? value;
}

export function QuantSelector({
  quant,
  kvQuant,
  onQuantChange,
  onKvQuantChange,
}: QuantSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Label>Weights Quant</Label>
          <InfoTooltip content={WEIGHTS_TOOLTIP} />
        </div>
        <Select value={quant} onValueChange={(v) => onQuantChange(v as QuantName)}>
          <SelectTrigger data-testid="weights-quant-trigger" className="w-full">
            <span>{getQuantLabel(quant)}</span>
          </SelectTrigger>
          <SelectContent>
            {WEIGHT_QUANT_GROUPS.map((group) => (
              <SelectGroup key={group.familyLabel}>
                <SelectLabel>{group.familyLabel}</SelectLabel>
                {group.items.map((q) => (
                  <SelectItem key={q.value} value={q.value}>
                    {q.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Label>KV Cache Quant</Label>
          <InfoTooltip content="Quantization of the KV cache (attention memory). BF16 is the default — same precision as native training, no quality loss. Q8 halves KV memory with negligible quality loss. Q4 quarters it with small quality impact." />
        </div>
        <Select value={kvQuant} onValueChange={(v) => onKvQuantChange(v as QuantName)}>
          <SelectTrigger data-testid="kv-quant-trigger" className="w-full">
            <span>{getKvQuantLabel(kvQuant)}</span>
          </SelectTrigger>
          <SelectContent>
            {KV_QUANTS.map((q) => (
              <SelectItem key={q.value} value={q.value}>
                {q.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
