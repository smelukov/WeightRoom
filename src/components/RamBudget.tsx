import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { InfoTooltip } from "./InfoTooltip";
import { getRamStatus, getRecommendedInstance } from "@/lib/calculator";

interface RamBudgetProps {
  totalGb: number;
  availableRam: string;
  onAvailableRamChange: (value: string) => void;
}

export function RamBudget({
  totalGb,
  availableRam,
  onAvailableRamChange,
}: RamBudgetProps) {
  const ramNum = parseFloat(availableRam);
  const hasRam = !isNaN(ramNum) && ramNum > 0;
  const status = hasRam ? getRamStatus(totalGb, ramNum) : null;
  const recommended = getRecommendedInstance(totalGb);

  const statusConfig = {
    fits: {
      label: "Fits comfortably",
      color: "text-success-foreground",
      bg: "bg-success-soft border-success/30",
      bar: "bg-success",
      icon: "\u2713",
    },
    tight: {
      label: "Tight fit",
      color: "text-warning-foreground",
      bg: "bg-warning-soft border-warning/30",
      bar: "bg-warning",
      icon: "\u26A0",
    },
    exceeds: {
      label: "Exceeds available RAM",
      color: "text-danger-foreground",
      bg: "bg-danger-soft border-danger/30",
      bar: "bg-danger",
      icon: "\u2717",
    },
  } as const;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Label>Your Available RAM</Label>
          <InfoTooltip content="Enter the total RAM/VRAM of your machine or cloud instance. Green = fits with headroom, yellow = tight fit (may swap), red = won't fit." />
        </div>
        <InputGroup>
          <InputGroupInput
            type="number"
            placeholder="e.g. 64"
            value={availableRam}
            onChange={(e) => onAvailableRamChange(e.target.value)}
            className="text-sm"
          />
          <InputGroupAddon align="inline-end">GB</InputGroupAddon>
        </InputGroup>
      </div>

      {hasRam && status && (
        <div
          className={`px-2.5 py-1 rounded-md border text-xs font-medium ${statusConfig[status].bg} ${statusConfig[status].color}`}
        >
          {statusConfig[status].icon} {statusConfig[status].label}
        </div>
      )}

      {hasRam && status && (
        <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${statusConfig[status].bar}`}
            style={{ width: `${Math.min(100, (totalGb / ramNum) * 100)}%` }}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Recommended: {recommended}
      </p>
    </div>
  );
}
