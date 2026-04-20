import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "./InfoTooltip";

interface ContextSliderProps {
  value: number; // in K tokens
  maxK: number;
  onChange: (value: number) => void;
}

const MIN_K = 1;

function kToSlider(k: number, maxK: number): number {
  const logMin = Math.log(MIN_K);
  const logMax = Math.log(maxK);
  const clamped = Math.max(MIN_K, Math.min(maxK, k));
  return ((Math.log(clamped) - logMin) / (logMax - logMin)) * 1000;
}

function sliderToK(pos: number, maxK: number): number {
  const logMin = Math.log(MIN_K);
  const logMax = Math.log(maxK);
  const k = Math.exp(logMin + (pos / 1000) * (logMax - logMin));
  if (k <= 2) return Math.round(k);
  if (k <= 16) return Math.round(k);
  if (k <= 64) return Math.round(k / 4) * 4;
  return Math.round(k / 8) * 8;
}

export function ContextSlider({ value, maxK, onChange }: ContextSliderProps) {
  // When the parent swaps the model for one with a smaller max context, the
  // value may exceed maxK. We display the clamped value without firing a
  // state update; the parent is expected to clamp in its own handler (see
  // ConfigCard's ModelSelector.onChange). This avoids an effect that would
  // race with parent state and keeps the component pure.
  const displayValue = Math.min(value, maxK);

  const ticks = [1, 4, 16, 64, 256, maxK]
    .filter((v) => v <= maxK)
    .filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Label>Context Length</Label>
        <InfoTooltip content="Number of tokens the model can process at once. Larger context uses more KV cache memory. Value is limited by the model's maximum supported context." />
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 space-y-1">
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={kToSlider(displayValue, maxK)}
            onChange={(e) => onChange(sliderToK(Number(e.target.value), maxK))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-muted accent-primary
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-ring [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer
              [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-ring [&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:cursor-pointer"
          />
          <div className="flex justify-between text-xs text-muted-foreground px-0.5">
            {ticks.map((t) => (
              <span key={t}>{t}K</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Input
            type="number"
            value={displayValue}
            onChange={(e) => {
              const num = parseInt(e.target.value);
              if (!isNaN(num) && num >= MIN_K && num <= maxK) {
                onChange(num);
              }
            }}
            className="w-20 h-8 text-sm text-right"
          />
          <span className="text-sm text-muted-foreground">K</span>
        </div>
      </div>
    </div>
  );
}
