import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { InfoTooltip } from "./InfoTooltip";
import { getDiskStatus, type DiskResult } from "@/lib/calculator";

interface StorageBudgetProps {
  disk: DiskResult;
  availableStorage: string;
  onAvailableStorageChange: (value: string) => void;
}

const statusConfig = {
  fits: {
    label: "Fits comfortably",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
    bar: "bg-emerald-500",
    icon: "✓",
  },
  tight: {
    label: "Tight fit",
    color: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
    bar: "bg-amber-500",
    icon: "⚠",
  },
  exceeds: {
    label: "Not enough space",
    color: "text-red-400",
    bg: "bg-red-400/10 border-red-400/20",
    bar: "bg-red-500",
    icon: "✗",
  },
};

export function StorageBudget({
  disk,
  availableStorage,
  onAvailableStorageChange,
}: StorageBudgetProps) {
  const storageNum = parseFloat(availableStorage);
  const hasStorage = !isNaN(storageNum) && storageNum > 0;
  const status = hasStorage ? getDiskStatus(disk.totalGb, storageNum) : null;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Label>Your Available Storage</Label>
          <InfoTooltip content="Free disk/SSD space. Includes the quantized model file plus OS overhead. Green = fits, yellow = tight, red = won't fit." />
        </div>
        <InputGroup>
          <InputGroupInput
            type="number"
            placeholder="e.g. 256"
            value={availableStorage}
            onChange={(e) => onAvailableStorageChange(e.target.value)}
            className="text-sm"
          />
          <InputGroupAddon align="inline-end">GB</InputGroupAddon>
        </InputGroup>
      </div>

      {hasStorage && status && (
        <div
          className={`px-2.5 py-1 rounded-md border text-xs font-medium ${statusConfig[status].bg} ${statusConfig[status].color}`}
        >
          {statusConfig[status].icon} {statusConfig[status].label}
        </div>
      )}

      {hasStorage && (
        <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${status ? statusConfig[status].bar : ""}`}
            style={{ width: `${Math.min(100, (disk.totalGb / storageNum) * 100)}%` }}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Model file: <span className="font-medium text-foreground">{disk.modelFileGb} GB</span>
      </p>
    </div>
  );
}
