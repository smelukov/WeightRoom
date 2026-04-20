import { memo } from "react";
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
import { KNOWN_MODELS } from "@/lib/models";
import type { CardData } from "@/lib/types";
import {
  getConfigLabel,
  getRawValueScore,
  getTps,
  getTpsSystem,
} from "./utils";

interface HostingDetailsViewProps {
  configs: CardData[];
}

export const HostingDetailsView = memo(function HostingDetailsView({
  configs,
}: HostingDetailsViewProps) {
  const withHosting = configs
    .map((c, i) => ({ ...c, _index: i }))
    .filter(
      (c) =>
        c.hosting?.price ||
        c.hosting?.gpuCount ||
        c.hosting?.notes ||
        c.hosting?.cpuCores,
    );

  if (withHosting.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Fill in Hosting Info fields in the cards above to compare providers here.
      </div>
    );
  }

  const sorted = [...withHosting].sort((a, b) => {
    const pa = parseFloat(a.hosting.price) || 0;
    const pb = parseFloat(b.hosting.price) || 0;
    return pa - pb;
  });

  const maxPrice = Math.max(
    ...sorted.map((c) => parseFloat(c.hosting.price) || 0),
    1,
  );
  const rawScores = sorted.map((c) => getRawValueScore(c));
  const normalizedScores = normalizeScores(rawScores);

  return (
    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
      {sorted.map((c, i) => {
        const price = parseFloat(c.hosting.price) || 0;
        const barWidth = maxPrice > 0 ? (price / maxPrice) * 100 : 0;
        // Index lookup is `number | undefined` under noUncheckedIndexedAccess.
        // The arrays are sized 1:1, so `?? 1.0` is just a defensive fallback
        // that also matches the "free hosting" semantics (no price → top score).
        const normScore = price <= 0 ? 1.0 : (normalizedScores[i] ?? 1.0);
        const color = getValueColor(normScore);
        const model = resolveModel(c);
        const quantLabel = c.model.quant;
        const features: string[] = [];
        // Capabilities are a KnownModel-only concept, so lookup the catalog entry.
        // Custom models simply have no capability flags to show.
        const knownModel =
          c.model.modelKey !== "custom"
            ? KNOWN_MODELS[c.model.modelKey]
            : undefined;
        if (knownModel?.capabilities?.thinking) features.push("thinking");
        if (knownModel?.capabilities?.toolUse) features.push("tools");
        if (knownModel?.capabilities?.vlm) features.push("vision");

        const ram = c.hosting.availableRam || "—";
        const storage = c.hosting.availableStorage || "—";
        const gpuCount = c.hosting.gpuCount || "—";
        const cpuCores = c.hosting.cpuCores || "—";
        const gpuVram = c.hosting.gpuVram ? `${c.hosting.gpuVram}GB` : "—";
        const cpuFreq = c.hosting.cpuFreqGHz ? `${c.hosting.cpuFreqGHz}GHz` : null;
        const ramBW = c.hosting.ramBandwidthGBs ? `${c.hosting.ramBandwidthGBs}GB/s` : null;

        const ramNum = parseFloat(c.hosting.availableRam) || 0;
        const storageNum = parseFloat(c.hosting.availableStorage) || 0;
        const gpuCountNum = parseInt(c.hosting.gpuCount) || 0;
        const gpuVramNum = parseFloat(c.hosting.gpuVram) || 0;
        const hasGPU = gpuCountNum > 0 && gpuVramNum > 0;
        const concurrentUsers = c.model.concurrentUsers ?? 1;
        const kvCacheFillPct = c.model.kvCacheFillPct ?? 100;

        const ramResult = model ? calcLLMRam(getCalcOptions(c, model)) : null;
        const diskResult = model ? calcDisk(model.params, c.model.quant) : null;

        const ramStatus = ramResult
          ? hasGPU
            ? getRamStatus(ramResult.weightsGb + ramResult.kvCacheGb, gpuCountNum * gpuVramNum)
            : ramNum > 0
              ? getRamStatus(ramResult.totalGb, ramNum)
              : null
          : null;
        const diskStatus =
          diskResult && storageNum > 0
            ? getDiskStatus(diskResult.totalGb, storageNum)
            : null;
        const tps = getTps(c);
        const tpsSystem = getTpsSystem(c);
        const tpsLabel = tps != null ? getTpsLabel(tps) : null;

        return (
          <div
            key={c.id}
            className="rounded-lg bg-secondary/30 border border-border overflow-hidden"
          >
            {c.hosting.notes && (
              <div className="px-3 py-1.5 bg-secondary/50 text-xs text-muted-foreground font-medium">
                {c.hosting.notes}
              </div>
            )}
            <div className="px-3 py-2">
              <div className="flex items-center gap-3 mb-1.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {getConfigLabel(c, c._index)} · {quantLabel} · {c.model.contextK}K ctx
                  </div>
                </div>
                <div className="relative w-32 h-5 bg-secondary rounded-full overflow-hidden shrink-0">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all"
                    style={{ width: `${barWidth}%`, backgroundColor: color }}
                  />
                  <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs font-semibold">
                    ${price.toLocaleString()}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground shrink-0 w-16 text-right">
                  Score: {(normScore * 100).toFixed(0)}%
                </div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  🧠{" "}
                  {hasGPU
                    ? `${gpuCountNum}×${gpuVramNum}GB VRAM`
                    : `${ram}GB RAM`}
                  {ramStatus && (
                    <span
                      className={`ml-1 font-medium ${
                        ramStatus === "fits"
                          ? "text-emerald-400"
                          : ramStatus === "tight"
                            ? "text-amber-400"
                            : "text-red-400"
                      }`}
                    >
                      {ramStatus === "fits" ? "✓" : ramStatus === "tight" ? "⚠" : "✗"}
                    </span>
                  )}
                </span>
                <span>
                  💾 {storage}GB SSD
                  {diskStatus && (
                    <span
                      className={`ml-1 font-medium ${
                        diskStatus === "fits"
                          ? "text-emerald-400"
                          : diskStatus === "tight"
                            ? "text-amber-400"
                            : "text-red-400"
                      }`}
                    >
                      {diskStatus === "fits" ? "✓" : diskStatus === "tight" ? "⚠" : "✗"}
                    </span>
                  )}
                </span>
                <span>🎮 {gpuCount} GPU {gpuVram !== "—" ? `· ${gpuVram} VRAM` : ""}</span>
                <span>🔧 {cpuCores} CPU{cpuFreq ? ` · ${cpuFreq}` : ""}</span>
                {ramBW && <span>⚡ {ramBW} RAM BW</span>}
                {tps != null && tpsLabel && (
                  <span className={`font-medium ${tpsLabel.color}`}>
                    ⚡{" "}
                    {concurrentUsers > 1 && tpsSystem != null
                      ? `${tps >= 10 ? Math.round(tps) : tps.toFixed(1)} tok/s/user · ${tpsSystem >= 10 ? Math.round(tpsSystem) : tpsSystem.toFixed(1)} sys`
                      : `${tps >= 10 ? Math.round(tps) : tps.toFixed(1)} tok/s`}{" "}
                    · {tpsLabel.label}
                  </span>
                )}
                {concurrentUsers > 1 && (
                  <span className="text-muted-foreground/70">
                    👥 {concurrentUsers} users{kvCacheFillPct < 100 ? ` · ${kvCacheFillPct}% fill` : ""}
                  </span>
                )}
                {features.length > 0 && (
                  <span className="text-foreground">🤖 {features.join(", ")}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});
