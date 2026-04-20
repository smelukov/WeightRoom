import { useMemo, useState, memo } from "react";
import {
  ChartContainer,
  ChartTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "@/components/ui/chart";
import { LabelList } from "recharts";
import { calcLLMRam, calcDisk, calcValueScore, getTpsLabel } from "@/lib/calculator";
import {
  getCalcOptions,
  getValueScoreInput,
  resolveModel,
} from "@/lib/calcInput";
import { KNOWN_MODELS } from "@/lib/models";
import type { CardData } from "@/lib/types";
import { MC, emptyChartConfig } from "./utils";

function getModelChartLabel(c: CardData, index: number): string {
  const name =
    c.model.modelKey === "custom"
      ? c.model.customModel.name || `Config ${index + 1}`
      : (KNOWN_MODELS[c.model.modelKey]?.displayName ?? c.model.modelKey);
  return `${name} · ${c.model.quant} · ${c.model.contextK}K`;
}

const MemoryTooltip = memo(function MemoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
}) {
  // Narrow `payload[0]` explicitly — under noUncheckedIndexedAccess the
  // length check above doesn't propagate to the indexed access.
  const first = payload?.[0];
  if (!active || !first) return null;
  const d = first.payload;
  const n = (k: string) => (d[k] as number) ?? 0;
  const totalRam  = n("weightsGb") + n("kvCacheGb") + n("osRamGb");
  const totalDisk = n("modelFileGb") + n("diskOsGb");
  const users = n("concurrentUsers") || 1;
  const fill  = n("kvCacheFillPct")  || 100;
  const isMultiUser = users > 1 || fill < 100;
  const kvLabel = isMultiUser
    ? `KV Cache (×${users}${fill < 100 ? `, ${fill}%` : ""})`
    : "KV Cache";

  return (
    <div className="rounded-lg bg-card border border-border p-3 shadow-lg min-w-[220px] text-xs space-y-2">
      <div className="font-medium">{String(d.name)}</div>
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
          RAM — {totalRam.toFixed(1)} GB
        </div>
        <div className="space-y-0.5 text-muted-foreground">
          {[
            { label: "Weights",  key: "weightsGb", color: MC.weights  },
            { label: kvLabel,    key: "kvCacheGb",  color: MC.kvCache  },
            { label: "OS",       key: "osRamGb",    color: MC.osRam    },
          ].map(({ label, key, color }) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                {label}
              </span>
              <span className="font-medium text-foreground tabular-nums">{n(key).toFixed(1)} GB</span>
            </div>
          ))}
        </div>
      </div>
      <div className="pt-1 border-t border-border">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
          Disk — {totalDisk.toFixed(1)} GB
        </div>
        <div className="space-y-0.5 text-muted-foreground">
          {[
            { label: "Model File", key: "modelFileGb", color: MC.modelFile },
            { label: "OS (Disk)",  key: "diskOsGb",    color: MC.diskOs    },
          ].map(({ label, key, color }) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                {label}
              </span>
              <span className="font-medium text-foreground tabular-nums">{n(key).toFixed(1)} GB</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

const SpeedTooltip = memo(function SpeedTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
}) {
  const first = payload?.[0];
  if (!active || !first) return null;
  const d = first.payload;
  const tps = d.tpsUser as number | null;
  const tpsSys = d.tpsSystem as number | null;
  if (tps == null) return null;
  const label = getTpsLabel(tps);
  const users = (d.concurrentUsers as number) ?? 1;
  const isMultiUser = users > 1;

  function fmt(v: number) {
    return v >= 10 ? String(Math.round(v)) : v.toFixed(1);
  }

  return (
    <div className="rounded-lg bg-card border border-border p-3 shadow-lg min-w-[200px] text-xs space-y-1.5">
      <div className="font-medium">{String(d.name)}</div>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{isMultiUser ? "Per user" : "Speed"}</span>
          <span className={`font-semibold ${label?.color ?? ""}`}>
            {fmt(tps)} tok/s{label ? ` · ${label.label}` : ""}
          </span>
        </div>
        {isMultiUser && tpsSys != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">System (×{users})</span>
            <span className="font-semibold text-success">{fmt(tpsSys)} tok/s</span>
          </div>
        )}
      </div>
    </div>
  );
});

interface ModelsChartProps {
  configs: CardData[];
}

export const ModelsChart = memo(function ModelsChart({ configs }: ModelsChartProps) {
  const [tab, setTab] = useState<"memory" | "speed">("memory");

  const data = useMemo(
    () =>
      configs.map((c, i) => {
        const model = resolveModel(c);
        const concurrentUsers = c.model.concurrentUsers ?? 1;
        const kvCacheFillPct  = c.model.kvCacheFillPct  ?? 100;

        const ram = model ? calcLLMRam(getCalcOptions(c, model)) : null;
        const disk = model ? calcDisk(model.params, c.model.quant) : null;
        const tpsResult = model
          ? calcValueScore(getValueScoreInput(c, model))
          : null;

        const weightsGb   = ram?.weightsGb   ?? 0;
        const kvCacheGb   = ram?.kvCacheGb   ?? 0;
        const osRamGb     = ram?.osOverheadGb ?? 0;
        const modelFileGb = disk?.modelFileGb ?? 0;
        const diskOsGb    = disk?.osOverheadGb ?? 0;
        const tps         = tpsResult?.tps    ?? null;
        const tpsSys      = tpsResult?.tpsSystem ?? null;

        return {
          name: getModelChartLabel(c, i),
          weightsGb, kvCacheGb, osRamGb,
          totalRamGb:  `${(weightsGb + kvCacheGb + osRamGb).toFixed(1)} GB`,
          modelFileGb, diskOsGb,
          totalDiskGb: `${(modelFileGb + diskOsGb).toFixed(1)} GB`,
          speed:       tps,
          tpsUser:     tps,
          tpsSystem:   tpsSys,
          speedLabel:  tps != null
            ? `${tps >= 10 ? Math.round(tps) : tps.toFixed(1)} t/s`
            : "",
          concurrentUsers, kvCacheFillPct,
        };
      }),
    [configs],
  );

  const hasTps   = data.some((d) => d.speed != null && d.speed > 0);
  const hasMulti = data.some((d) => d.concurrentUsers > 1);
  const showSpeed = hasTps;

  // Recharts inlines `fill` on <text> tags, so Tailwind classes don't help.
  // Use the theme token directly — it switches automatically on .dark.
  const labelColor = "var(--color-muted-foreground)";
  const chartH = (n: number) => Math.max(160, n * 50 + 50);

  const memLegend = [
    { color: MC.weights,   label: "Weights"    },
    { color: MC.kvCache,   label: "KV Cache"   },
    { color: MC.osRam,     label: "OS (RAM)"   },
    { color: MC.modelFile, label: "Model File" },
    { color: MC.diskOs,    label: "OS (Disk)"  },
  ];
  const spdLegend = hasMulti
    ? [
        { color: MC.tpsUser, label: "Speed per user" },
        { color: MC.tpsSys,  label: "Server total"   },
      ]
    : [{ color: MC.tpsUser, label: "Speed (tok/s)" }];

  const activeTab = tab === "speed" && !showSpeed ? "memory" : tab;

  return (
    <div className="space-y-3">
      {/* ── Tab selector + Legend ───────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 rounded-lg bg-secondary/50 p-0.5">
          <button
            onClick={() => setTab("memory")}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              activeTab === "memory"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Memory
          </button>
          {showSpeed && (
            <button
              onClick={() => setTab("speed")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeTab === "speed"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Speed
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {(activeTab === "memory" ? memLegend : spdLegend).map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Memory chart ────────────────────────────────────────────── */}
      {activeTab === "memory" && (
        <ChartContainer
          config={emptyChartConfig}
          className="w-full"
          style={{ height: chartH(configs.length) }}
        >
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 64, bottom: 4, left: 4 }}
            barCategoryGap="25%"
            barGap={3}
          >
            <XAxis type="number" tickLine={false} unit=" GB" tick={{ fontSize: 11, fill: labelColor }} />
            <YAxis type="category" dataKey="name" tickLine={false} width={185} tick={{ fontSize: 11, fill: labelColor }} />
            <ChartTooltip content={<MemoryTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="weightsGb"   stackId="ram"  fill={MC.weights}   isAnimationActive={false} />
            <Bar dataKey="kvCacheGb"   stackId="ram"  fill={MC.kvCache}   isAnimationActive={false} />
            <Bar dataKey="osRamGb"     stackId="ram"  fill={MC.osRam}     isAnimationActive={false} radius={[0,3,3,0]}>
              <LabelList dataKey="totalRamGb"  position="right" style={{ fontSize: 10, fill: labelColor }} />
            </Bar>
            <Bar dataKey="modelFileGb" stackId="disk" fill={MC.modelFile} isAnimationActive={false} />
            <Bar dataKey="diskOsGb"    stackId="disk" fill={MC.diskOs}    isAnimationActive={false} radius={[0,3,3,0]}>
              <LabelList dataKey="totalDiskGb" position="right" style={{ fontSize: 10, fill: labelColor }} />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}

      {/* ── Speed chart ─────────────────────────────────────────────── */}
      {activeTab === "speed" && showSpeed && (
        <ChartContainer
          config={emptyChartConfig}
          className="w-full"
          style={{ height: chartH(configs.length) }}
        >
          <BarChart
            data={data.filter((d) => d.speed != null)}
            layout="vertical"
            margin={{ top: 4, right: 72, bottom: 4, left: 4 }}
            barCategoryGap="25%"
            barGap={3}
          >
            <XAxis type="number" tickLine={false} unit=" t/s" tick={{ fontSize: 11, fill: labelColor }} />
            <YAxis type="category" dataKey="name" tickLine={false} width={185} tick={{ fontSize: 11, fill: labelColor }} />
            <ChartTooltip content={<SpeedTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="tpsUser" fill={MC.tpsUser} isAnimationActive={false} radius={hasMulti ? [0,0,0,0] : [0,3,3,0]}>
              <LabelList dataKey="speedLabel" position="right" style={{ fontSize: 10, fill: labelColor }} />
            </Bar>
            {hasMulti && (
              <Bar dataKey="tpsSystem" fill={MC.tpsSys} isAnimationActive={false} radius={[0,3,3,0]}>
                <LabelList
                  dataKey="tpsSystem"
                  position="right"
                  formatter={(v: unknown) => {
                    const n = v as number | null;
                    return n != null ? `${n >= 10 ? Math.round(n) : n.toFixed(1)} t/s` : "";
                  }}
                  style={{ fontSize: 10, fill: labelColor }}
                />
              </Bar>
            )}
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
});
