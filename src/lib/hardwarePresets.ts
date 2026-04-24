/**
 * Hardware presets shared by the Available Hardware UI block and the
 * documentation in Footer.tsx.
 *
 * Why a dedicated module:
 * - keeping the catalog in ONE place avoids label / number drift between
 *   the dropdown and the "How calculations work" panel;
 * - keeping it OUT of the .tsx file lets `react-refresh` keep working —
 *   that plugin requires component files to only export components;
 * - mirrors the architecture of `enginePresets.ts` (same id-based
 *   resolution, same custom-fallback semantics).
 *
 * IMPORTANT — separation of concerns vs `enginePresets.ts`:
 * Hardware and engine presets are orthogonal. Engine controls
 * `kvCacheFillPct` (a runtime KV-cache strategy) and lives in
 * `ModelSettings`. Hardware controls bandwidth / VRAM / RAM fields and
 * lives in `HostingData`. Picking an H100 should never touch the
 * engine, and switching to vLLM should never touch the hardware.
 */

import type { HostingData } from "./types";

/**
 * Family of hardware. Used to group options in the UI dropdown via
 * `SelectGroup` / `SelectLabel`. Adding a new category requires both a
 * label in `HARDWARE_CATEGORY_LABELS` and at least one preset; any
 * preset whose category is not in `HARDWARE_CATEGORY_LABELS` will fall
 * through to its raw category string (intentional — fail loudly).
 */
export type HardwareCategory =
  | "apple_silicon_max"
  | "apple_silicon_ultra"
  | "nvidia_datacenter"
  | "nvidia_consumer"
  | "amd_datacenter";

/** Human-readable labels for each category, in display order. */
export const HARDWARE_CATEGORY_LABELS: Record<HardwareCategory, string> = {
  apple_silicon_max: "Apple Silicon — Max",
  apple_silicon_ultra: "Apple Silicon — Ultra",
  nvidia_datacenter: "NVIDIA Data Center",
  nvidia_consumer: "NVIDIA Consumer",
  amd_datacenter: "AMD Instinct",
};

/**
 * One hardware preset. Numbers are taken from official datasheets
 * (Apple Support tech specs, NVIDIA `data-center/*` pages, AMD
 * `instinct-tech-docs`) verified April 2026. See the data-source URLs
 * in the inline comments next to each preset entry.
 *
 * `hosting` is intentionally a `Partial<HostingData>` — a preset only
 * writes the fields it explicitly owns. See `applyHardwarePreset` for
 * exactly which keys each preset family touches.
 */
export interface HardwarePreset {
  /** Stable id, persisted in URL state via `HostingData.hardwarePresetId`. */
  id: string;
  category: HardwareCategory;
  /** Short label shown in the trigger and dropdown item. */
  label: string;
  /** One-sentence description shown in tooltip / Footer. */
  description: string;
  /** Subset of HostingData fields applied when this preset is picked. */
  hosting: Partial<HostingData>;
}

/** Sentinel value for the "user has manually edited fields" mode. */
export const CUSTOM_HARDWARE_ID = "custom";

// ─── Catalog ────────────────────────────────────────────────────────────────
// Numbers verified against:
//   - Apple Support tech specs (support.apple.com/en-us/126318 etc.)
//   - NVIDIA datasheets (nvidia.com/en-gb/data-center/h200/, etc.)
//   - AMD datasheets (amd.com/.../mi300x.html, .../mi325x.html)
// All as of April 2026.

/**
 * For Apple Silicon, the tuple is the MAX-spec configuration of that
 * chip (largest CPU/GPU bin and largest available unified memory). The
 * user can dial `availableRam` down after picking a preset; the
 * dropdown will then auto-switch to "Custom" — which is correct.
 */
function applePreset(args: {
  id: string;
  category: "apple_silicon_max" | "apple_silicon_ultra";
  label: string;
  cpuModel: string;
  /** Unified memory bandwidth in GB/s. */
  bandwidthGBs: number;
  /** Max unified memory size in GB for this chip. */
  maxRamGb: number;
  /** RAM type as printed by Apple ("LPDDR5", "LPDDR5X"). */
  ramType: string;
}): HardwarePreset {
  return {
    id: args.id,
    category: args.category,
    label: args.label,
    description: `${args.label} — unified memory architecture, ${args.maxRamGb} GB ${args.ramType} at ${args.bandwidthGBs} GB/s.`,
    hosting: {
      cpuModel: args.cpuModel,
      ramType: args.ramType,
      ramBandwidthGBs: String(args.bandwidthGBs),
      availableRam: String(args.maxRamGb),
      // Apple Silicon: no discrete GPU. Explicitly zero out the GPU
      // block so `calcValueScore` takes the RAM-bandwidth branch in
      // `calculator.ts` (see `hasGPU` check around line 298).
      gpuCount: "0",
      gpuVram: "0",
      gpuBandwidth: "0",
      gpuInfo: "",
      // Unified-memory access pattern: ~60% of theoretical peak (see
      // efficiencyPresets in AvailableHardware.tsx).
      efficiency: "60",
    },
  };
}

/**
 * For discrete GPU presets we deliberately set `gpuCount: "1"` only.
 * Multi-GPU server nodes (`8×H100 SXM`) are intentionally NOT included
 * — see the plan's "deferred" section. The user can dial `gpuCount` up
 * after picking a preset; the dropdown will then auto-switch to "Custom".
 *
 * The host RAM/CPU block is explicitly cleared to "" (not omitted) so
 * that switching from an Apple preset to a GPU preset normalises the
 * state — leaving stale `cpuModel: "Apple M5 Max"` next to a freshly
 * picked H100 was confusing in practice. Users with a custom server
 * (e.g. EPYC + DDR5 + H100) re-enter the host fields after picking the
 * GPU preset; the dropdown then auto-switches to Custom.
 *
 * Fields outside `PRESET_OWNED_FIELDS` (`cpuCores`, `cpuFreqGHz`,
 * `storageType`, `availableStorage`, `notes`, `price`, `osOverheadGb`)
 * are NEVER written by any preset.
 */
function gpuPreset(args: {
  id: string;
  category: "nvidia_datacenter" | "nvidia_consumer" | "amd_datacenter";
  label: string;
  /** GPU model identifier as printed on the box (used for `gpuInfo`). */
  gpuInfo: string;
  /** VRAM per device in GB. */
  vramGb: number;
  /** Memory bandwidth per device in GB/s. */
  bandwidthGBs: number;
  /** Memory generation, e.g. "HBM3", "HBM3e", "GDDR7". For tooltip. */
  memoryType: string;
}): HardwarePreset {
  return {
    id: args.id,
    category: args.category,
    label: args.label,
    description: `${args.label} — ${args.vramGb} GB ${args.memoryType} at ${args.bandwidthGBs} GB/s per device.`,
    hosting: {
      gpuCount: "1",
      gpuVram: String(args.vramGb),
      gpuBandwidth: String(args.bandwidthGBs),
      gpuInfo: args.gpuInfo,
      // Clear unified-memory branch so switching Apple → GPU normalises.
      cpuModel: "",
      ramType: "",
      ramBandwidthGBs: "",
      availableRam: "",
      // Discrete-GPU HBM/GDDR access pattern: ~80% of theoretical peak.
      efficiency: "80",
    },
  };
}

export const HARDWARE_PRESETS: readonly HardwarePreset[] = [
  // ── Apple Silicon Max (MacBook Pro 14"/16") ───────────────────────────
  applePreset({
    id: "m1-max",
    category: "apple_silicon_max",
    label: "Apple M1 Max",
    cpuModel: "Apple M1 Max",
    bandwidthGBs: 400,
    maxRamGb: 64,
    ramType: "LPDDR5",
  }),
  applePreset({
    id: "m2-max",
    category: "apple_silicon_max",
    label: "Apple M2 Max",
    cpuModel: "Apple M2 Max",
    bandwidthGBs: 400,
    maxRamGb: 96,
    ramType: "LPDDR5",
  }),
  applePreset({
    id: "m3-max",
    category: "apple_silicon_max",
    label: "Apple M3 Max",
    cpuModel: "Apple M3 Max",
    bandwidthGBs: 400,
    maxRamGb: 128,
    ramType: "LPDDR5",
  }),
  applePreset({
    id: "m4-max",
    category: "apple_silicon_max",
    label: "Apple M4 Max",
    cpuModel: "Apple M4 Max",
    bandwidthGBs: 546,
    maxRamGb: 128,
    ramType: "LPDDR5X",
  }),
  applePreset({
    id: "m5-max",
    category: "apple_silicon_max",
    label: "Apple M5 Max",
    cpuModel: "Apple M5 Max",
    bandwidthGBs: 614,
    maxRamGb: 128,
    ramType: "LPDDR5X",
  }),

  // ── Apple Silicon Ultra (Mac Studio) ──────────────────────────────────
  applePreset({
    id: "m1-ultra",
    category: "apple_silicon_ultra",
    label: "Apple M1 Ultra (Mac Studio)",
    cpuModel: "Apple M1 Ultra",
    bandwidthGBs: 800,
    maxRamGb: 128,
    ramType: "LPDDR5",
  }),
  applePreset({
    id: "m2-ultra",
    category: "apple_silicon_ultra",
    label: "Apple M2 Ultra (Mac Studio)",
    cpuModel: "Apple M2 Ultra",
    bandwidthGBs: 800,
    maxRamGb: 192,
    ramType: "LPDDR5",
  }),
  applePreset({
    id: "m3-ultra",
    category: "apple_silicon_ultra",
    label: "Apple M3 Ultra (Mac Studio 2025)",
    cpuModel: "Apple M3 Ultra",
    bandwidthGBs: 819,
    maxRamGb: 512,
    ramType: "LPDDR5X",
  }),

  // ── NVIDIA Data Center ────────────────────────────────────────────────
  gpuPreset({
    id: "a100-40",
    category: "nvidia_datacenter",
    label: "NVIDIA A100 40GB",
    gpuInfo: "A100 40GB",
    vramGb: 40,
    bandwidthGBs: 1555,
    memoryType: "HBM2e",
  }),
  gpuPreset({
    id: "a100-80",
    category: "nvidia_datacenter",
    label: "NVIDIA A100 80GB SXM",
    gpuInfo: "A100 80GB SXM",
    vramGb: 80,
    bandwidthGBs: 2039,
    memoryType: "HBM2e",
  }),
  gpuPreset({
    id: "h100-pcie",
    category: "nvidia_datacenter",
    label: "NVIDIA H100 PCIe 80GB",
    gpuInfo: "H100 PCIe 80GB",
    vramGb: 80,
    bandwidthGBs: 2000,
    memoryType: "HBM3",
  }),
  gpuPreset({
    id: "h100-sxm",
    category: "nvidia_datacenter",
    label: "NVIDIA H100 SXM 80GB",
    gpuInfo: "H100 SXM 80GB",
    vramGb: 80,
    bandwidthGBs: 3350,
    memoryType: "HBM3",
  }),
  gpuPreset({
    id: "h200",
    category: "nvidia_datacenter",
    label: "NVIDIA H200 141GB",
    gpuInfo: "H200 141GB",
    vramGb: 141,
    bandwidthGBs: 4800,
    memoryType: "HBM3e",
  }),
  gpuPreset({
    id: "b200",
    category: "nvidia_datacenter",
    label: "NVIDIA B200 192GB",
    gpuInfo: "B200 192GB",
    vramGb: 192,
    bandwidthGBs: 8000,
    memoryType: "HBM3e",
  }),

  // ── NVIDIA Consumer ───────────────────────────────────────────────────
  gpuPreset({
    id: "rtx-3090",
    category: "nvidia_consumer",
    label: "NVIDIA RTX 3090",
    gpuInfo: "RTX 3090",
    vramGb: 24,
    bandwidthGBs: 936,
    memoryType: "GDDR6X",
  }),
  gpuPreset({
    id: "rtx-4090",
    category: "nvidia_consumer",
    label: "NVIDIA RTX 4090",
    gpuInfo: "RTX 4090",
    vramGb: 24,
    bandwidthGBs: 1008,
    memoryType: "GDDR6X",
  }),
  gpuPreset({
    id: "rtx-5090",
    category: "nvidia_consumer",
    label: "NVIDIA RTX 5090",
    gpuInfo: "RTX 5090",
    vramGb: 32,
    bandwidthGBs: 1792,
    memoryType: "GDDR7",
  }),

  // ── AMD Instinct (Data Center) ────────────────────────────────────────
  gpuPreset({
    id: "mi300x",
    category: "amd_datacenter",
    label: "AMD Instinct MI300X",
    gpuInfo: "MI300X 192GB",
    vramGb: 192,
    bandwidthGBs: 5300,
    memoryType: "HBM3",
  }),
  gpuPreset({
    id: "mi325x",
    category: "amd_datacenter",
    label: "AMD Instinct MI325X",
    gpuInfo: "MI325X 256GB",
    vramGb: 256,
    bandwidthGBs: 6000,
    memoryType: "HBM3e",
  }),
];

/**
 * The set of HostingData keys that a preset may write. Any preset whose
 * `hosting` includes a key outside this allow-list is a programming
 * error — the unit test enforces it. Centralising the list also makes
 * it trivial for `resolveActiveHardware` to know which fields to compare
 * and for `AvailableHardware` to know which manual edits should switch
 * the dropdown to Custom.
 *
 * `efficiency` is in the list because Apple unified memory and discrete
 * GPU have very different real-world bandwidth utilisation (~60% vs
 * ~80%), so the preset must steer it. Manually moving the efficiency
 * slider after picking a preset is interpreted as overriding the
 * preset and switches the dropdown to Custom.
 */
export const PRESET_OWNED_FIELDS: readonly (keyof HostingData)[] = [
  "cpuModel",
  "ramType",
  "ramBandwidthGBs",
  "availableRam",
  "gpuCount",
  "gpuVram",
  "gpuBandwidth",
  "gpuInfo",
  "efficiency",
] as const;

function findPresetById(id: string): HardwarePreset | null {
  return HARDWARE_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * Group presets by category for the UI dropdown. Returns the categories
 * in the declaration order of `HARDWARE_CATEGORY_LABELS` so the
 * dropdown order is deterministic and not dependent on array iteration
 * quirks.
 */
export function getHardwarePresetGroups(): Array<{
  category: HardwareCategory;
  label: string;
  items: readonly HardwarePreset[];
}> {
  const categories = Object.keys(HARDWARE_CATEGORY_LABELS) as HardwareCategory[];
  return categories.map((category) => ({
    category,
    label: HARDWARE_CATEGORY_LABELS[category],
    items: HARDWARE_PRESETS.filter((p) => p.category === category),
  }));
}

/**
 * Return true when every field declared in `preset.hosting` is present
 * in `hosting` with the same value. Used to detect "user manually
 * matched a preset's numbers" so we can light up the dropdown label
 * even on a legacy URL that has no `hardwarePresetId`.
 */
function presetMatchesHosting(
  preset: HardwarePreset,
  hosting: HostingData,
): boolean {
  for (const [key, expected] of Object.entries(preset.hosting)) {
    const actual = hosting[key as keyof HostingData];
    if (actual !== expected) return false;
  }
  return true;
}

/**
 * Resolve the active preset from `(hardwarePresetId, hosting fields)`.
 *
 * Semantics mirror `resolveActiveEngine`:
 * - `storedId === "custom"` → null (force custom mode);
 * - `storedId` matches a preset AND every field still matches → that preset;
 * - `storedId` matches a preset BUT a field disagrees → null (de-sync =
 *   treat as custom; happens when the user manually edits a single
 *   field — failing loudly is better than silently lying with a stale
 *   preset label);
 * - `storedId` undefined (legacy URL) → fall back to matching by values
 *   (first preset whose every field matches);
 * - unknown id → null.
 */
export function resolveActiveHardware(
  hosting: HostingData,
  storedId: string | undefined,
): HardwarePreset | null {
  if (storedId === CUSTOM_HARDWARE_ID) return null;
  if (storedId !== undefined) {
    const preset = findPresetById(storedId);
    if (!preset) return null;
    return presetMatchesHosting(preset, hosting) ? preset : null;
  }
  return HARDWARE_PRESETS.find((p) => presetMatchesHosting(p, hosting)) ?? null;
}
