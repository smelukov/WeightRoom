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
    color: "text-success-foreground",
    bg: "bg-success-soft border-success/30",
    bar: "bg-success",
    icon: "✓",
  },
  tight: {
    label: "Tight fit",
    color: "text-warning-foreground",
    bg: "bg-warning-soft border-warning/30",
    bar: "bg-warning",
    icon: "⚠",
  },
  exceeds: {
    label: "Not enough space",
    color: "text-danger-foreground",
    bg: "bg-danger-soft border-danger/30",
    bar: "bg-danger",
    icon: "✗",
  },
} as const;

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
