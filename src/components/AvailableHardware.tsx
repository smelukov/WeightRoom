import { LuCpu } from "react-icons/lu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { InfoTooltip } from "./InfoTooltip";
import {
  getRamStatus,
  getRecommendedInstance,
  getDiskStatus,
  getTpsLabel,
  type DiskResult,
} from "@/lib/calculator";
import type { HostingData } from "@/lib/types";

interface AvailableHardwareProps {
  totalRamGb: number;
  /** Model memory without OS overhead (weights + kv cache). */
  modelMemoryGb: number;
  disk: DiskResult;
  hosting: HostingData;
  onHostingChange: (value: HostingData) => void;
  showHosting?: boolean | undefined;
  /** Per-user TPS estimate. */
  tps?: number | null | undefined;
  /** System-wide TPS (tps × concurrentUsers). */
  tpsSystem?: number | null | undefined;
  /** Number of concurrent users, used to show multi-user speed info. */
  concurrentUsers?: number | undefined;
}

const OS_PRESETS = [
  { label: "iOS", value: 2, title: "iOS / iPadOS — ~2 GB used by the OS and system processes." },
  { label: "Linux", value: 2, title: "Linux server — ~2 GB for OS and system services on a lean installation." },
  { label: "macOS", value: 6, title: "macOS — ~6 GB typically consumed by WindowServer, Spotlight, system agents." },
];

const statusConfig = {
  fits: { label: "Fits", color: "text-success-foreground", bar: "bg-success", icon: "✓" },
  tight: { label: "Tight", color: "text-warning-foreground", bar: "bg-warning", icon: "⚠" },
  exceeds: { label: "Exceeds", color: "text-danger-foreground", bar: "bg-danger", icon: "✗" },
} as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-muted-foreground uppercase tracking-wider pt-1 border-t border-border">
      {children}
    </div>
  );
}

function FitsBar({
  required,
  available,
  hint,
}: {
  required: number;
  available: number;
  hint?: string | undefined;
}) {
  if (available <= 0) return null;
  const ratio = required / available;
  const status = ratio <= 0.8 ? "fits" : ratio <= 1.0 ? "tight" : "exceeds";
  const cfg = statusConfig[status];
  return (
    <div className="space-y-1 pt-0.5">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${cfg.color}`}>
          {cfg.icon} {cfg.label}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {required.toFixed(1)} / {available.toFixed(1)} GB
          {hint && <span className="ml-1 opacity-70">{hint}</span>}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${cfg.bar}`}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

function formatTps(tps: number): string {
  return tps >= 10 ? String(Math.round(tps)) : tps.toFixed(1);
}

function SpeedBlock({
  tps,
  tpsSystem,
  concurrentUsers = 1,
}: {
  tps: number;
  tpsSystem?: number | null | undefined;
  concurrentUsers?: number | undefined;
}) {
  const label = getTpsLabel(tps);
  const isMultiUser = concurrentUsers > 1 && tpsSystem != null && tpsSystem > 0;

  return (
    <div className={`rounded-lg bg-secondary/50 p-2.5 ${isMultiUser ? "space-y-2" : "text-center"}`}>
      {isMultiUser ? (
        <div className="grid grid-cols-2 divide-x divide-border text-center">
          {/* Per-user */}
          <div className="pr-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Per user</div>
            <div className="text-xl font-bold tabular-nums">
              {formatTps(tps)}
              <span className="text-[10px] font-normal text-muted-foreground ml-0.5">tok/s</span>
            </div>
            {label && <div className={`text-xs font-semibold mt-0.5 ${label.color}`}>{label.label}</div>}
          </div>
          {/* System */}
          <div className="pl-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">System</div>
            <div className="text-xl font-bold tabular-nums">
              {formatTps(tpsSystem!)}
              <span className="text-[10px] font-normal text-muted-foreground ml-0.5">tok/s</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">×{concurrentUsers} users</div>
          </div>
        </div>
      ) : (
        <>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Speed</div>
          <div className="text-xl font-bold tabular-nums">
            {formatTps(tps)}
            <span className="text-[10px] font-normal text-muted-foreground ml-0.5">tok/s</span>
          </div>
          {label && <div className={`text-xs font-semibold mt-0.5 ${label.color}`}>{label.label}</div>}
        </>
      )}
      <div className="pt-1.5 mt-1.5 border-t border-border/50 text-center text-[10px] italic text-muted-foreground/80">
        theoretical maximum
      </div>
    </div>
  );
}

function Field({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1 min-w-0">
      {/* shadcn `Label` is itself `display: flex`, so a `truncate` class on
          it does NOT clip its text content — `text-overflow: ellipsis`
          requires a *block* container with a definite width. We wrap the
          label text in an inner <span> and put `truncate` there. The
          `flex-1 min-w-0` on `Label` lets that span actually shrink inside
          the parent flex row instead of forcing its intrinsic width. */}
      <div className="flex items-center gap-1 min-w-0">
        <Label className="text-xs min-w-0 flex-1">
          <span className="truncate">{label}</span>
        </Label>
        {tooltip && <InfoTooltip content={tooltip} />}
      </div>
      {children}
    </div>
  );
}

export function AvailableHardware({
  totalRamGb,
  modelMemoryGb,
  disk,
  hosting,
  onHostingChange,
  showHosting = false,
  tps,
  tpsSystem,
  concurrentUsers = 1,
}: AvailableHardwareProps) {
  const availableRam = hosting.availableRam;
  const availableStorage = hosting.availableStorage;
  const osOverheadGb = hosting.osOverheadGb;

  const onAvailableRamChange = (val: string) => onHostingChange({ ...hosting, availableRam: val });
  const onAvailableStorageChange = (val: string) => onHostingChange({ ...hosting, availableStorage: val });
  const onOsOverheadGbChange = (val: number) => onHostingChange({ ...hosting, osOverheadGb: val });

  const update = (field: keyof HostingData, val: string) =>
    onHostingChange({ ...hosting, [field]: val });

  const gpuCount = parseInt(hosting.gpuCount) || 0;
  const gpuVram = parseFloat(hosting.gpuVram) || 0;
  const hasGPU = gpuCount > 0 && gpuVram > 0;
  const ramNum = parseFloat(availableRam) || 0;
  const storageNum = parseFloat(availableStorage) || 0;

  // Memory fits: weightsGb + kvGb ≤ gpuCount × gpuVram + ram - osOverhead
  const totalAvailableMemory = gpuCount * gpuVram + ramNum - osOverheadGb;
  const memoryFitHint = hasGPU && ramNum > 0
    ? `${gpuCount}×${gpuVram} VRAM + ${ramNum} RAM − ${osOverheadGb} OS`
    : hasGPU
      ? `${gpuCount}×${gpuVram} VRAM`
      : ramNum > 0
        ? `${ramNum} − ${osOverheadGb} OS`
        : undefined;

  const efficiencyPresets = [
    { label: "Unified", value: "60", title: "Unified memory (Apple Silicon, ARM SoC) — shared CPU/GPU memory pool, non-sequential access from quantized kernels. Typical: 55–65%." },
    { label: "CPU", value: "65", title: "CPU inference on DDR4/DDR5 — memory controller overhead, NUMA effects, prefetch misses. Typical: 60–70%." },
    { label: "GPU", value: "80", title: "Discrete GPU with HBM2e/HBM3 (A100, H100) — high-bandwidth sequential access, efficient kernels. Typical: 75–85%." },
  ] as const;

  const header = (
    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
      <LuCpu className="w-3.5 h-3.5" aria-hidden="true" />
      Available Hardware
      <InfoTooltip content="Enter your machine specs to check if the model fits and estimate inference speed." />
    </div>
  );

  // ── Simple layout (single mode, no hosting) ─────────────────────────────
  if (!showHosting) {
    // For status: model weights + KV cache fit into the *combined* memory pool
    // (VRAM + RAM − OS). When the user has GPU info we count both pools so a
    // CPU/GPU split (e.g. partial offload) doesn't trigger a false "exceeds".
    const totalAvailable = hasGPU
      ? gpuCount * gpuVram + ramNum
      : ramNum;
    const requiredGb = hasGPU ? modelMemoryGb : totalRamGb;
    return (
      <div className="space-y-3 p-3 rounded-lg bg-muted/50 border border-border">
        {header}
        <div className="grid grid-cols-2 gap-3">
          {/* RAM + VRAM */}
          <div className="space-y-1.5">
            {hasGPU && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">VRAM</Label>
                  <InfoTooltip content="Auto-summed from the GPU section: GPU count × VRAM per device. Edit values in the GPU section to change this." />
                </div>
                <div className="flex items-center gap-1.5">
                  <InputGroup className="h-7">
                    <InputGroupInput
                      type="number"
                      value={String(gpuCount * gpuVram)}
                      readOnly
                      aria-readonly
                      className="text-xs opacity-60 cursor-not-allowed"
                    />
                    <InputGroupAddon align="inline-end">GB</InputGroupAddon>
                  </InputGroup>
                  <span className="text-[10px] text-muted-foreground shrink-0">{gpuCount}×{gpuVram}</span>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs">RAM</Label>
                <InfoTooltip content="System RAM. For Apple Silicon / unified memory this is the whole memory pool. On a discrete-GPU machine, RAM is used as overflow when the model doesn't fit in VRAM." />
              </div>
              <div className="flex items-center gap-1.5">
                <InputGroup className="h-7">
                  <InputGroupInput
                    type="number"
                    placeholder={hasGPU ? "e.g. 32" : "e.g. 64"}
                    value={availableRam}
                    onChange={(e) => onAvailableRamChange(e.target.value)}
                    className="text-xs"
                  />
                  <InputGroupAddon align="inline-end">GB</InputGroupAddon>
                </InputGroup>
                {totalAvailable > 0 && (() => {
                  const st = getRamStatus(requiredGb, totalAvailable);
                  const cfg = statusConfig[st];
                  return <span className={`text-xs font-medium shrink-0 ${cfg.color}`}>{cfg.icon} {cfg.label}</span>;
                })()}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {hasGPU
                ? `Total pool: ${gpuCount * gpuVram + ramNum} GB (VRAM + RAM)`
                : `Minimal: ${getRecommendedInstance(totalRamGb)}`}
            </p>
          </div>
          {/* Storage */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label className="text-xs">Storage</Label>
              <InfoTooltip content="Free disk/SSD space." />
            </div>
            <div className="flex items-center gap-1.5">
              <InputGroup className="h-7">
                <InputGroupInput
                  type="number"
                  placeholder="e.g. 256"
                  value={availableStorage}
                  onChange={(e) => onAvailableStorageChange(e.target.value)}
                  className="text-xs"
                />
                <InputGroupAddon align="inline-end">GB</InputGroupAddon>
              </InputGroup>
              {(() => {
                const num = parseFloat(availableStorage);
                if (isNaN(num) || num <= 0) return null;
                const st = getDiskStatus(disk.totalGb, num);
                const cfg = statusConfig[st];
                return <span className={`text-xs font-medium shrink-0 ${cfg.color}`}>{cfg.icon} {cfg.label}</span>;
              })()}
            </div>
            <p className="text-[10px] text-muted-foreground">Minimal: {disk.modelFileGb} GB</p>
          </div>
        </div>

        {tps != null && tps > 0 && (
          <SpeedBlock tps={tps} tpsSystem={tpsSystem} concurrentUsers={concurrentUsers} />
        )}

        {/* OS overhead */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label className="text-xs">OS Overhead</Label>
            <InfoTooltip content="RAM consumed by the OS and background services. Linux / iOS ≈ 2 GB, macOS / Windows ≈ 6 GB." />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex gap-1">
              {OS_PRESETS.map((p) => (
                <button key={p.label} type="button" title={p.title}
                  onClick={() => onOsOverheadGbChange(p.value)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors border ${
                    osOverheadGb === p.value
                      ? "bg-primary/10 border-primary/40 text-foreground"
                      : "bg-secondary/50 border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            <InputGroup className="h-7 w-20 shrink-0">
              <InputGroupInput type="number" min={0} value={osOverheadGb}
                onChange={(e) => onOsOverheadGbChange(Math.max(0, Number(e.target.value)))}
                className="text-xs" />
              <InputGroupAddon align="inline-end">GB</InputGroupAddon>
            </InputGroup>
          </div>
        </div>

        {!(tps != null && tps > 0) && (
          <div className="text-[10px] text-muted-foreground bg-secondary/30 rounded px-2 py-1.5">
            💡 Fill in <strong>RAM BW (GB/s)</strong> for CPU/Apple Silicon, or <strong>GPUs + GPU BW</strong> for GPU inference to see estimated speed. Switch to <strong>Hosting</strong> view to enter these fields.
          </div>
        )}
      </div>
    );
  }

  // ── Full hosting layout ──────────────────────────────────────────────────
  return (
    <div className="space-y-3 p-3 rounded-lg bg-muted/50 border border-border">
      {header}

      {/* Provider + Price */}
      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <Field label="Provider / Notes" tooltip="Cloud provider or instance name, e.g. AWS p4d.24xlarge, Apple M1 Max.">
          <Input placeholder="e.g. AWS p4d.24xlarge" value={hosting.notes}
            onChange={(e) => update("notes", e.target.value)} className="h-7 text-xs" />
        </Field>
        <Field label="Price" tooltip="Monthly cost of the instance.">
          <InputGroup className="h-7 w-28">
            <InputGroupInput type="number" placeholder="0" value={hosting.price}
              onChange={(e) => update("price", e.target.value)} className="text-xs" />
            <InputGroupAddon align="inline-end">$/mo</InputGroupAddon>
          </InputGroup>
        </Field>
      </div>

      {/* ── GPU ─────────────────────────────────────────────────────────── */}
      <SectionLabel>GPU</SectionLabel>
      {/* 4 columns need ≥768px to fit "VRAM (GB)" + the `?` icon + an input
          like `e.g. 1555` without truncating. At sm (≥640) — e.g. iPhone
          Plus landscape — there isn't enough room, so we stay at 2 cols
          until md. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Field label="Count" tooltip="Number of GPU devices, e.g. 8 for 8×A100.">
          <Input type="number" placeholder="0" value={hosting.gpuCount}
            onChange={(e) => update("gpuCount", e.target.value)} className="h-7 text-xs" />
        </Field>
        <Field label="VRAM (GB)" tooltip="VRAM per device in GB, e.g. 80 for A100 80GB.">
          <Input type="number" placeholder="e.g. 80" value={hosting.gpuVram}
            onChange={(e) => update("gpuVram", e.target.value)} className="h-7 text-xs" />
        </Field>
        <Field label="BW (GB/s)" tooltip="GPU memory bandwidth in GB/s. A100 ≈ 1555, H100 ≈ 3350, RTX 4090 ≈ 1008. Required for TPS estimation.">
          <Input type="number" placeholder="e.g. 1555" value={hosting.gpuBandwidth}
            onChange={(e) => update("gpuBandwidth", e.target.value)} className="h-7 text-xs" />
        </Field>
        <Field label="Model" tooltip="GPU model name, e.g. A100, H100, RTX 4090.">
          <Input placeholder="e.g. A100" value={hosting.gpuInfo}
            onChange={(e) => update("gpuInfo", e.target.value)} className="h-7 text-xs" />
        </Field>
      </div>

      {/* ── CPU ─────────────────────────────────────────────────────────── */}
      <SectionLabel>CPU</SectionLabel>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Field label="Cores" tooltip="Number of CPU cores (vCPUs).">
          <Input type="number" placeholder="0" value={hosting.cpuCores}
            onChange={(e) => update("cpuCores", e.target.value)} className="h-7 text-xs" />
        </Field>
        <Field label="Freq (GHz)" tooltip="Effective CPU clock frequency in GHz.">
          <Input type="text" inputMode="decimal" placeholder="e.g. 3.6" value={hosting.cpuFreqGHz}
            onChange={(e) => update("cpuFreqGHz", e.target.value)} className="h-7 text-xs" />
        </Field>
        <Field label="Model" tooltip="CPU model name, e.g. AMD EPYC 9654, Intel Xeon W-3375, Apple M1 Max.">
          <Input placeholder="e.g. EPYC 9654" value={hosting.cpuModel}
            onChange={(e) => update("cpuModel", e.target.value)} className="h-7 text-xs" />
        </Field>
      </div>

      {/* ── Memory ──────────────────────────────────────────────────────── */}
      <SectionLabel>Memory</SectionLabel>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Field label="RAM (GB)" tooltip="Total system RAM. For Apple Silicon, this is the unified memory size.">
          <InputGroup className="h-7">
            <InputGroupInput type="number" placeholder="e.g. 128" value={availableRam}
              onChange={(e) => onAvailableRamChange(e.target.value)} className="text-xs" />
            <InputGroupAddon align="inline-end">GB</InputGroupAddon>
          </InputGroup>
        </Field>
        <Field label="BW (GB/s)" tooltip="System RAM bandwidth in GB/s. DDR4 ≈ 50, DDR5 ≈ 90, M1 Max ≈ 400. Key bottleneck for CPU inference.">
          <Input type="number" placeholder="e.g. 90" value={hosting.ramBandwidthGBs}
            onChange={(e) => update("ramBandwidthGBs", e.target.value)} className="h-7 text-xs" />
        </Field>
        <Field label="Type" tooltip="RAM type, e.g. DDR4, DDR5, LPDDR5, HBM3. For reference only.">
          <Input placeholder="e.g. DDR5" value={hosting.ramType}
            onChange={(e) => update("ramType", e.target.value)} className="h-7 text-xs" />
        </Field>
      </div>

      {/* OS Overhead */}
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-1">
          <Label className="text-xs">OS Overhead</Label>
          <InfoTooltip content="RAM consumed by the OS and background services. Linux / iOS ≈ 2 GB, macOS / Windows ≈ 6 GB." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {OS_PRESETS.map((p) => (
              <button key={p.label} type="button" title={p.title}
                onClick={() => onOsOverheadGbChange(p.value)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors border ${
                  osOverheadGb === p.value
                    ? "bg-primary/10 border-primary/40 text-foreground"
                    : "bg-secondary/50 border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          <InputGroup className="h-7 w-20 ml-auto">
            <InputGroupInput type="number" min={0} value={osOverheadGb}
              onChange={(e) => onOsOverheadGbChange(Math.max(0, Number(e.target.value)))}
              className="text-xs" />
            <InputGroupAddon align="inline-end">GB</InputGroupAddon>
          </InputGroup>
        </div>
      </div>

      {/* Bandwidth Efficiency */}
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-1">
          <Label className="text-xs">BW Efficiency</Label>
          <InfoTooltip content="Ratio of real-world LLM throughput to theoretical peak bandwidth (%). Peak is never fully utilized due to non-sequential memory access in Q4/Q8 dequantization, kernel launch overhead, and driver overhead. Apple Silicon ≈ 60%, discrete GPU HBM ≈ 80%, CPU DDR5 ≈ 65%." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {efficiencyPresets.map((p) => (
              <button key={p.label} type="button" title={p.title}
                onClick={() => update("efficiency", p.value)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors border ${
                  hosting.efficiency === p.value
                    ? "bg-primary/10 border-primary/40 text-foreground"
                    : "bg-secondary/50 border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          <InputGroup className="h-7 w-20 ml-auto">
            <InputGroupInput type="number" min={1} max={100}
              value={hosting.efficiency ?? "80"}
              onChange={(e) => update("efficiency", e.target.value)}
              className="text-xs" />
            <InputGroupAddon align="inline-end">%</InputGroupAddon>
          </InputGroup>
        </div>
      </div>

      {/* Memory fits */}
      <FitsBar
        required={modelMemoryGb}
        available={totalAvailableMemory}
        hint={memoryFitHint}
      />

      {/* ── Storage ─────────────────────────────────────────────────────── */}
      <SectionLabel>Storage</SectionLabel>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Field label="Capacity (GB)" tooltip="Free disk space available for the model and OS.">
          <InputGroup className="h-7">
            <InputGroupInput type="number" placeholder="e.g. 500" value={availableStorage}
              onChange={(e) => onAvailableStorageChange(e.target.value)} className="text-xs" />
            <InputGroupAddon align="inline-end">GB</InputGroupAddon>
          </InputGroup>
        </Field>
        <Field label="Type" tooltip="Storage type for reference: NVMe, SSD, HDD.">
          <Input placeholder="e.g. NVMe" value={hosting.storageType}
            onChange={(e) => update("storageType", e.target.value)} className="h-7 text-xs" />
        </Field>
        <Field label="OS (GB)" tooltip="Disk space reserved for the OS in the storage estimate. Currently fixed at 20 GB (lean Linux baseline). For macOS / Windows installations, expect 30–50 GB extra outside this estimate.">
          <InputGroup className="h-7">
            <InputGroupInput type="number" placeholder="20" value={disk.osOverheadGb}
              readOnly className="text-xs opacity-60 cursor-not-allowed" />
            <InputGroupAddon align="inline-end">GB</InputGroupAddon>
          </InputGroup>
        </Field>
      </div>

      {/* Storage fits */}
      {storageNum > 0 && (
        <FitsBar
          required={disk.totalGb}
          available={storageNum}
          hint={`model ${disk.modelFileGb} + OS ${disk.osOverheadGb} GB`}
        />
      )}

      {/* ── Speed ───────────────────────────────────────────────────────── */}
      {tps != null && tps > 0
        ? <SpeedBlock tps={tps} tpsSystem={tpsSystem} concurrentUsers={concurrentUsers} />
        : (
          <div className="text-[10px] text-muted-foreground bg-secondary/30 rounded px-2 py-1.5">
            💡 Fill in <strong>RAM BW (GB/s)</strong> for CPU/Apple Silicon, or <strong>GPU BW</strong> for GPU inference to see estimated speed. Common: M1/M2 Max ≈ 400, A100 ≈ 1555, H100 ≈ 3350, RTX 4090 ≈ 1008.
          </div>
        )
      }
    </div>
  );
}
