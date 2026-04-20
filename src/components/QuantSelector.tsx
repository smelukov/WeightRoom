import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "./InfoTooltip";
import { WEIGHT_QUANTS, KV_QUANTS } from "@/lib/models";
import type { QuantName } from "@/lib/types";

interface QuantSelectorProps {
  quant: QuantName;
  kvQuant: QuantName;
  onQuantChange: (value: QuantName) => void;
  onKvQuantChange: (value: QuantName) => void;
}

function getQuantLabel(value: QuantName, list: { value: QuantName; label: string }[]): string {
  return list.find((q) => q.value === value)?.label ?? value;
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
          <InfoTooltip content="Bits per model weight parameter. Lower bits = smaller model size but slightly lower quality. Q4 (4-bit) is the most popular choice for local inference." />
        </div>
        <Select value={quant} onValueChange={(v) => onQuantChange(v as QuantName)}>
          <SelectTrigger data-testid="weights-quant-trigger" className="w-full">
            <span>{getQuantLabel(quant, WEIGHT_QUANTS)}</span>
          </SelectTrigger>
          <SelectContent>
            {WEIGHT_QUANTS.map((q) => (
              <SelectItem key={q.value} value={q.value}>
                {q.label}
              </SelectItem>
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
            <span>{getQuantLabel(kvQuant, KV_QUANTS)}</span>
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
