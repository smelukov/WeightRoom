import { memo, useState } from "react";
import {
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { ScatterChart, Scatter, ZAxis, XAxis, YAxis, Cell } from "recharts";
import {
  calcLLMRam,
  calcDisk,
  normalizeScores,
  getValueColor,
  getTpsLabel,
  getRamStatus,
  getDiskStatus,
} from "@/lib/calculator";
import { getCalcOptions, resolveModel } from "@/lib/calcInput";
import type { CardData } from "@/lib/types";
import {
  getConfigLabel,
  getRawValueScore,
  getTps,
  getTpsSystem,
} from "./utils";

type YAxisOption = "vram" | "ram" | "params" | "cpu" | "tps";

const yAxisOptions: { value: YAxisOption; label: string }[] = [
  { value: "vram",   label: "GPU VRAM" },
  { value: "ram",    label: "RAM"      },
  { value: "params", label: "Params"   },
  { value: "cpu",    label: "CPU Cores"},
  { value: "tps",    label: "Speed"    },
];

interface ScatterPoint {
  x: number;
  y: number;
  z: number;
  score: number;
  color: string;
  name: string;
  quant: string;
  kvQuant: string;
  contextK: number;
  paramsB: string;
  tps: number | null;
  tpsSystem: number | null;
  concurrentUsers: number;
  kvCacheFillPct: number;
  cpuCores: number;
  cpuFreqGHz: number | null;
  gpuCount: number;
  gpuVram: string | null;
  gpuModel: string | null;
  ramBW: string | null;
  ram: number;
  ramLabel: string;
  notes: string;
  pricePerGbRam: string | null;
  pricePerHddGb: string | null;
  ramStatus: "fits" | "tight" | "exceeds" | null;
  diskStatus: "fits" | "tight" | "exceeds" | null;
}

const ScatterTooltip = memo(function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ScatterPoint }[];
}) {
  // First payload entry is `T | undefined` under noUncheckedIndexedAccess.
  // We narrow explicitly instead of relying on `payload.length` so the type
  // system can follow the guarantee.
  const first = payload?.[0];
  if (!active || !first) return null;
  const d = first.payload;

  return (
    <div className="rounded-lg bg-card border border-border p-3 shadow-lg min-w-[240px]">
      {d.notes && (
        <div className="text-xs text-muted-foreground mb-1 font-medium">{d.notes}</div>
      )}

      <div className="mb-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Model</div>
        <div className="space-y-0.5 text-xs">
          {[
            { label: "Name",     value: d.name          },
            { label: "Params",   value: `${d.paramsB}B` },
            { label: "Quant",    value: d.quant         },
            { label: "KV Quant", value: d.kvQuant       },
            { label: "Context",  value: `${d.contextK}K`},
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {(d.concurrentUsers > 1 || d.kvCacheFillPct < 100) && (
        <div className="mb-2 pt-2 border-t border-border">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Workload</div>
          <div className="space-y-0.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Concurrent users</span>
              <span className="font-medium">{d.concurrentUsers}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">KV fill</span>
              <span className="font-medium">{d.kvCacheFillPct}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="mb-2 pt-2 border-t border-border">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Hardware</div>
        <div className="space-y-0.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">GPU VRAM</span>
            <span className="font-medium">{d.gpuVram || "—"} GB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">RAM</span>
            <span className="font-medium">{d.ram} GB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Storage</span>
            <span className="font-medium">{d.z} GB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">GPU</span>
            <span className="font-medium">
              {d.gpuCount ? `${d.gpuCount}×` : "—"}
              {d.gpuModel ? ` ${d.gpuModel}` : ""}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">CPU</span>
            <span className="font-medium">
              {d.cpuCores || "—"}
              {d.cpuFreqGHz ? ` × ${d.cpuFreqGHz} GHz` : ""}
            </span>
          </div>
          {d.ramBW && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">RAM BW</span>
              <span className="font-medium">{d.ramBW} GB/s</span>
            </div>
          )}
        </div>
      </div>

      {d.tps != null && (() => {
        const label = getTpsLabel(d.tps);
        const isMultiUser = d.concurrentUsers > 1 && d.tpsSystem != null;
        return (
          <div className="mb-2 pt-2 border-t border-border">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Speed</div>
            <div className="space-y-0.5 text-xs">
              {isMultiUser ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Per user</span>
                    <span className="font-semibold">
                      {d.tps! >= 10 ? Math.round(d.tps!) : d.tps!.toFixed(1)} tok/s
                      {label && <span className={`ml-1.5 ${label.color}`}>{label.label}</span>}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">System (×{d.concurrentUsers})</span>
                    <span className="font-semibold">
                      {d.tpsSystem! >= 10 ? Math.round(d.tpsSystem!) : d.tpsSystem!.toFixed(1)} tok/s
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TPS</span>
                  <span className="font-semibold">
                    {d.tps! >= 10 ? Math.round(d.tps!) : d.tps!.toFixed(1)} tok/s
                    {label && <span className={`ml-1.5 ${label.color}`}>{label.label}</span>}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {(d.ramStatus || d.diskStatus) && (
        <div className="mb-2 pt-2 border-t border-border">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Fit</div>
          <div className="space-y-0.5 text-xs">
            {d.ramStatus && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{d.ramLabel ?? "RAM"}</span>
                <span className={`font-semibold ${
                  d.ramStatus === "fits" ? "text-success" : d.ramStatus === "tight" ? "text-warning" : "text-danger"
                }`}>
                  {d.ramStatus === "fits" ? "✓ Fits" : d.ramStatus === "tight" ? "⚠ Tight" : "✗ Exceeds"}
                </span>
              </div>
            )}
            {d.diskStatus && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Storage</span>
                <span className={`font-semibold ${
                  d.diskStatus === "fits" ? "text-success" : d.diskStatus === "tight" ? "text-warning" : "text-danger"
                }`}>
                  {d.diskStatus === "fits" ? "✓ Fits" : d.diskStatus === "tight" ? "⚠ Tight" : "✗ Exceeds"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-border">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Economics</div>
        <div className="space-y-0.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Price</span>
            <span className="font-semibold">${d.x.toLocaleString()}/mo</span>
          </div>
          {d.pricePerGbRam && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">$/GB RAM</span>
              <span className="font-medium">${d.pricePerGbRam}</span>
            </div>
          )}
          {d.pricePerHddGb && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">$/GB HDD</span>
              <span className="font-medium">${d.pricePerHddGb}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

interface HostingScatterViewProps {
  configs: CardData[];
}

export const HostingScatterView = memo(function HostingScatterView({
  configs,
}: HostingScatterViewProps) {
  const [yAxis, setYAxis] = useState<YAxisOption>("vram");

  const withHosting = configs
    .map((c, i) => ({ ...c, _index: i }))
    .filter(
      (c) =>
        parseFloat(c.hosting.availableRam) > 0 ||
        parseFloat(c.hosting.gpuVram) > 0,
    );

  if (withHosting.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Fill in RAM / VRAM in the Hosting Info fields above to compare here.
      </div>
    );
  }

  const rawScores = withHosting.map((c) => getRawValueScore(c));
  const normalizedScores = normalizeScores(rawScores);

  const data: ScatterPoint[] = withHosting.map((c, i) => {
    const price = parseFloat(c.hosting.price) || 0;
    const vram = parseFloat(c.hosting.gpuVram) || 0;
    const ram = parseFloat(c.hosting.availableRam) || 0;
    const model = resolveModel(c);
    const paramsB = model ? model.params / 1e9 : 0;
    const cpu = parseInt(c.hosting.cpuCores) || 0;
    const storage = parseFloat(c.hosting.availableStorage) || 0;
    // Same defensive `?? 1.0` as in HostingDetailsView — index lookups on a
    // 1:1 array can't really return undefined here, but exactOptional + noUIA
    // need the explicit fallback.
    const normScore = price <= 0 ? 1.0 : (normalizedScores[i] ?? 1.0);
    const pricePerGbRam = price > 0 && ram > 0 ? (price / ram).toFixed(2) : null;
    const pricePerHddGb = price > 0 && storage > 0 ? (price / storage).toFixed(2) : null;

    const tps = getTps(c);
    const tpsSystem = getTpsSystem(c);
    const concurrentUsers = c.model.concurrentUsers ?? 1;
    const kvCacheFillPct = c.model.kvCacheFillPct ?? 100;

    const ramResult = model ? calcLLMRam(getCalcOptions(c, model)) : null;
    const diskResult = model ? calcDisk(model.params, c.model.quant) : null;

    const gpuCnt = parseInt(c.hosting.gpuCount) || 0;
    const gpuVr = parseFloat(c.hosting.gpuVram) || 0;
    const hasGPU = gpuCnt > 0 && gpuVr > 0;

    const ramStatus = ramResult
      ? hasGPU
        ? getRamStatus(ramResult.weightsGb + ramResult.kvCacheGb, gpuCnt * gpuVr)
        : ram > 0
          ? getRamStatus(ramResult.totalGb, ram)
          : null
      : null;
    const diskStatus =
      diskResult && storage > 0
        ? getDiskStatus(diskResult.totalGb, storage)
        : null;

    const yValue: Record<YAxisOption, number> = {
      vram:   vram || ram,
      ram:    ram,
      params: paramsB,
      cpu:    cpu,
      tps:    tps || 0,
    };

    return {
      x: price,
      y: yValue[yAxis],
      z: storage,
      score: normScore,
      color: getValueColor(normScore),
      name: getConfigLabel(c, c._index),
      quant: c.model.quant,
      kvQuant: c.model.kvQuant,
      contextK: c.model.contextK,
      paramsB: paramsB.toFixed(0),
      tps,
      tpsSystem,
      concurrentUsers,
      kvCacheFillPct,
      cpuCores: cpu,
      cpuFreqGHz: parseFloat(c.hosting.cpuFreqGHz) || null,
      gpuCount: parseFloat(c.hosting.gpuCount) || 0,
      gpuVram: c.hosting.gpuVram || null,
      gpuModel: c.hosting.gpuInfo || null,
      ramBW: c.hosting.ramBandwidthGBs || null,
      ram,
      ramLabel: hasGPU ? "VRAM" : "RAM",
      notes: c.hosting.notes,
      pricePerGbRam,
      pricePerHddGb,
      ramStatus,
      diskStatus,
    };
  });

  const yAxisLabel = yAxisOptions.find((o) => o.value === yAxis)?.label ?? "Value";
  const yAxisUnit =
    yAxis === "params" ? "B"
    : yAxis === "cpu"  ? ""
    : yAxis === "tps"  ? "tok/s"
    : "GB";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Y-axis:</span>
        <div className="flex gap-1 rounded-lg bg-secondary/50 p-0.5">
          {yAxisOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setYAxis(opt.value)}
              className={`px-2 py-0.5 text-[10px] rounded-md transition-colors ${
                yAxis === opt.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <ChartContainer
        config={{}}
        className="w-full"
        style={{ height: Math.max(250, withHosting.length * 50 + 100) }}
      >
        <ScatterChart margin={{ top: 20, right: 200, bottom: 40, left: 60 }}>
          <XAxis type="number" dataKey="x" name="Price" unit=" $" tickLine={false} />
          <YAxis
            type="number"
            dataKey="y"
            name={yAxisLabel}
            unit={yAxisUnit ? ` ${yAxisUnit}` : ""}
            tickLine={false}
          />
          <ZAxis type="number" dataKey="z" range={[60, 400]} name="Storage" unit=" GB" />
          <ChartTooltip content={<ScatterTooltip />} cursor={false} />
          <Scatter data={data} fill="var(--color-chart-1)">
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Scatter>
        </ScatterChart>
      </ChartContainer>
      <div className="flex items-center gap-4 text-xs text-muted-foreground justify-center">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-success inline-block" /> Best value
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-warning inline-block" /> Moderate
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-danger inline-block" /> Expensive
        </span>
      </div>
    </div>
  );
});
