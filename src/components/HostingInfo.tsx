import { LuCloud } from "react-icons/lu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "./InfoTooltip";
import type { HostingData } from "@/lib/types";

interface HostingInfoProps {
  value: HostingData;
  onChange: (value: HostingData) => void;
}

export function HostingInfo({ value, onChange }: HostingInfoProps) {
  const update = (field: keyof HostingData, val: string) => {
    onChange({ ...value, [field]: val });
  };

  return (
    <div className="space-y-2 p-3 rounded-lg bg-sky-950/30 border border-sky-800/30">
      <div className="flex items-center gap-1.5 text-xs font-medium text-sky-400 uppercase tracking-wider">
        <LuCloud className="w-3.5 h-3.5" aria-hidden="true" />
        Hosting Info
        <InfoTooltip content="Optional fields to compare cloud hosting options side by side." />
      </div>

      {/* Row 1: Price */}
      <div className="space-y-1">
        <Label className="text-xs">Price ($/mo)</Label>
        <Input
          type="number"
          placeholder="0"
          value={value.price}
          onChange={(e) => update("price", e.target.value)}
          className="h-7 text-xs"
        />
      </div>

      {/* Row 2: GPU Count, GPU VRAM, GPU Model, GPU Bandwidth */}
      <div className="grid grid-cols-4 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">GPUs</Label>
          <Input
            type="number"
            placeholder="0"
            value={value.gpuCount}
            onChange={(e) => update("gpuCount", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">VRAM (GB)</Label>
          <Input
            type="number"
            placeholder="e.g. 80"
            value={value.gpuVram}
            onChange={(e) => update("gpuVram", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">GPU Model</Label>
          <Input
            placeholder="e.g. A100"
            value={value.gpuInfo}
            onChange={(e) => update("gpuInfo", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">GPU BW (GB/s)</Label>
          <Input
            type="number"
            placeholder="e.g. 1555"
            value={value.gpuBandwidth}
            onChange={(e) => update("gpuBandwidth", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      </div>

      {/* Row 3: CPU Cores, CPU Freq, RAM BW */}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">CPU Cores</Label>
          <Input
            type="number"
            placeholder="0"
            value={value.cpuCores}
            onChange={(e) => update("cpuCores", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">CPU Freq (GHz)</Label>
          <Input
            type="number"
            step="0.1"
            placeholder="e.g. 3.6"
            value={value.cpuFreqGHz}
            onChange={(e) => update("cpuFreqGHz", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">RAM BW (GB/s)</Label>
          <Input
            type="number"
            placeholder="e.g. 90"
            value={value.ramBandwidthGBs}
            onChange={(e) => update("ramBandwidthGBs", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      </div>

      {/* Row 4: Notes */}
      <div className="space-y-1">
        <Label className="text-xs">Provider / Notes</Label>
        <Input
          placeholder="e.g. AWS p4d.24xlarge"
          value={value.notes}
          onChange={(e) => update("notes", e.target.value)}
          className="h-7 text-xs"
        />
      </div>
    </div>
  );
}
