import type { CalcResult, KvFormula } from "@/lib/types";
import type { DiskResult } from "@/lib/calculator";
import { KV_FORMULA_DETAILS } from "@/lib/kvFormulas";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ResultCardProps {
  result: CalcResult;
  disk: DiskResult;
  /** KV cache formula used, for display purposes. */
  kvFormula?: KvFormula | undefined;
  /** Number of concurrent users, used to annotate the KV cache label. */
  concurrentUsers?: number | undefined;
  /** KV cache fill percentage, used to annotate the KV cache label. */
  kvCacheFillPct?: number | undefined;
}

const BASE_RAM_SEGMENTS = [
  { key: "weightsGb" as const, label: "Weights", color: "bg-chart-1" },
  { key: "kvCacheGb" as const, label: "KV Cache", color: "bg-chart-2" },
  { key: "osOverheadGb" as const, label: "OS", color: "bg-chart-3" },
];

const diskSegments = [
  { key: "modelFileGb" as const, label: "Model", color: "bg-chart-4" },
  { key: "osOverheadGb" as const, label: "OS", color: "bg-chart-3" },
];

function BreakdownCard({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg bg-secondary/50 px-2 py-1.5 text-center min-w-0 overflow-hidden">
      <div className="flex items-center justify-center gap-1 mb-0.5 min-w-0">
        <div className={`w-1.5 h-1.5 rounded-sm shrink-0 ${color}`} />
        <span
          className="text-[10px] text-muted-foreground truncate leading-tight"
          title={label}
        >
          {label}
        </span>
      </div>
      <div className="text-xs font-semibold tabular-nums whitespace-nowrap">
        {value}{" "}
        <span className="text-[10px] font-normal text-muted-foreground">
          GB
        </span>
      </div>
    </div>
  );
}

function StackedBar({
  segments,
  total,
  values,
}: {
  segments: { key: string; label: string; color: string }[];
  total: number;
  values: Record<string, number>;
}) {
  return (
    <div className="h-3 flex rounded-full overflow-hidden">
      {segments.map((s) => {
        // Index lookups on `Record<string, number>` return `number | undefined`
        // under noUncheckedIndexedAccess. Falling back to 0 keeps the bar
        // rendering correctly even if a segment is missing from the values
        // map (treated as a 0-width slice).
        const value = values[s.key] ?? 0;
        const pct = total > 0 ? (value / total) * 100 : 0;
        return (
          <div
            key={s.key}
            className={`${s.color} transition-all duration-500`}
            style={{ width: `${pct}%` }}
            title={`${s.label}: ${value} GB (${Math.round(pct)}%)`}
          />
        );
      })}
    </div>
  );
}

export function ResultCard({ result, disk, kvFormula, concurrentUsers = 1, kvCacheFillPct = 100 }: ResultCardProps) {
  const isMultiUser = concurrentUsers > 1 || kvCacheFillPct < 100;
  const kvCacheLabel = isMultiUser
    ? `KV (×${concurrentUsers}${kvCacheFillPct < 100 ? `, ${kvCacheFillPct}%` : ""})`
    : "KV Cache";

  const ramSegments = BASE_RAM_SEGMENTS.map((s) =>
    s.key === "kvCacheGb" ? { ...s, label: kvCacheLabel } : s,
  );

  const ramValues: Record<string, number> = {
    weightsGb: result.weightsGb,
    kvCacheGb: result.kvCacheGb,
    osOverheadGb: result.osOverheadGb,
  };
  const diskValues: Record<string, number> = {
    modelFileGb: disk.modelFileGb,
    osOverheadGb: disk.osOverheadGb,
  };

  return (
    <div className="grid grid-cols-2 divide-x divide-border text-center">
      {/* RAM column */}
      <div className="pr-4 space-y-3">
        <div>
          <div className="flex items-center justify-center gap-1.5">
            <div className="text-sm text-muted-foreground uppercase tracking-wider">
              RAM
            </div>
            {kvFormula && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      // The badge is a tooltip trigger, not a navigational
                      // control — it does not perform an action on click.
                      // Using <button> (not <span>) keeps it focusable so
                      // keyboard users can read the formula description.
                      aria-label={`KV cache formula: ${KV_FORMULA_DETAILS[kvFormula].label}`}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium hover:text-foreground transition-colors cursor-help"
                    >
                      {KV_FORMULA_DETAILS[kvFormula].label}
                    </button>
                  }
                />
                <TooltipContent className="max-w-xs">
                  <div className="space-y-1">
                    <div className="font-mono text-[10px] opacity-80">
                      {KV_FORMULA_DETAILS[kvFormula].formula}
                    </div>
                    <div className="opacity-70">
                      {KV_FORMULA_DETAILS[kvFormula].models}
                    </div>
                    <div>{KV_FORMULA_DETAILS[kvFormula].note}</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            {result.totalGb}
            <span className="text-xl sm:text-2xl font-normal text-muted-foreground ml-1">
              GB
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            weights + kv + os
          </div>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            {ramSegments.map((s) => (
              <BreakdownCard
                key={s.key}
                color={s.color}
                label={s.label}
                value={ramValues[s.key] ?? 0}
              />
            ))}
          </div>
          <StackedBar
            segments={ramSegments}
            total={result.totalGb}
            values={ramValues}
          />
        </div>
      </div>

      {/* Storage column */}
      <div className="pl-4 space-y-3">
        <div>
          <div className="text-sm text-muted-foreground uppercase tracking-wider">
            Storage
          </div>
          <div className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            {disk.totalGb}
            <span className="text-xl sm:text-2xl font-normal text-muted-foreground ml-1">
              GB
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            model file + os
          </div>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            {diskSegments.map((s) => (
              <BreakdownCard
                key={s.key}
                color={s.color}
                label={s.label}
                value={diskValues[s.key] ?? 0}
              />
            ))}
          </div>
          <StackedBar
            segments={diskSegments}
            total={disk.totalGb}
            values={diskValues}
          />
        </div>
      </div>
    </div>
  );
}
