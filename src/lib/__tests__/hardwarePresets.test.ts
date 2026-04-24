import { describe, it, expect } from "vitest";
import {
  CUSTOM_HARDWARE_ID,
  HARDWARE_CATEGORY_LABELS,
  HARDWARE_PRESETS,
  PRESET_OWNED_FIELDS,
  getHardwarePresetGroups,
  resolveActiveHardware,
  type HardwarePreset,
} from "../hardwarePresets";
import type { HostingData } from "../types";

const baseHosting: HostingData = {
  price: "",
  gpuCount: "",
  gpuVram: "",
  gpuInfo: "",
  gpuBandwidth: "",
  cpuCores: "",
  cpuFreqGHz: "",
  cpuModel: "",
  ramBandwidthGBs: "",
  ramType: "",
  storageType: "",
  efficiency: "80",
  notes: "",
  availableRam: "",
  availableStorage: "",
  osOverheadGb: 2,
};

/** Apply a preset's `hosting` patch to `baseHosting` (used in round-trip tests). */
function apply(preset: HardwarePreset): HostingData {
  return {
    ...baseHosting,
    ...preset.hosting,
    hardwarePresetId: preset.id,
  };
}

describe("HARDWARE_PRESETS — catalog integrity", () => {
  it("has unique ids across the entire catalog", () => {
    const ids = HARDWARE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never uses the CUSTOM_HARDWARE_ID sentinel as a preset id", () => {
    // Otherwise the dropdown's Custom item and the preset would collide.
    expect(
      HARDWARE_PRESETS.find((p) => p.id === CUSTOM_HARDWARE_ID),
    ).toBeUndefined();
  });

  it("only writes fields declared in PRESET_OWNED_FIELDS", () => {
    // The allow-list is what `resolveActiveHardware` knows to compare and
    // what `AvailableHardware.update` knows to flip to Custom — drifting
    // outside it would silently make those edits unrevocable.
    const owned = new Set<string>(PRESET_OWNED_FIELDS);
    for (const preset of HARDWARE_PRESETS) {
      const written = Object.keys(preset.hosting);
      for (const key of written) {
        expect(owned, `${preset.id} writes unexpected field "${key}"`).toContain(
          key,
        );
      }
    }
  });

  it("covers every category declared in HARDWARE_CATEGORY_LABELS", () => {
    const usedCategories = new Set(HARDWARE_PRESETS.map((p) => p.category));
    for (const cat of Object.keys(HARDWARE_CATEGORY_LABELS)) {
      expect(usedCategories.has(cat as keyof typeof HARDWARE_CATEGORY_LABELS))
        .toBe(true);
    }
  });
});

describe("HARDWARE_PRESETS — Apple Silicon presets", () => {
  const applePresets = HARDWARE_PRESETS.filter(
    (p) =>
      p.category === "apple_silicon_max" ||
      p.category === "apple_silicon_ultra",
  );

  it("zeroes out the GPU block (unified memory branch)", () => {
    // calcValueScore takes the RAM-bandwidth branch only when
    // gpuCount=0 OR gpuBandwidthGBs=0. Apple Silicon must hit that branch.
    for (const preset of applePresets) {
      expect(preset.hosting.gpuCount, `${preset.id} gpuCount`).toBe("0");
      expect(preset.hosting.gpuVram, `${preset.id} gpuVram`).toBe("0");
      expect(preset.hosting.gpuBandwidth, `${preset.id} gpuBandwidth`).toBe("0");
      expect(preset.hosting.gpuInfo, `${preset.id} gpuInfo`).toBe("");
    }
  });

  it("fills the RAM bandwidth + capacity from the unified memory pool", () => {
    for (const preset of applePresets) {
      const bw = parseFloat(preset.hosting.ramBandwidthGBs ?? "");
      const ram = parseFloat(preset.hosting.availableRam ?? "");
      expect(bw, `${preset.id} ramBandwidthGBs`).toBeGreaterThan(0);
      expect(ram, `${preset.id} availableRam`).toBeGreaterThan(0);
      expect(preset.hosting.cpuModel ?? "").toMatch(/Apple/);
      expect(preset.hosting.ramType ?? "").toMatch(/LPDDR5/);
    }
  });

  it("sets BW efficiency to 60% (Unified memory access pattern)", () => {
    // Apple Silicon's non-sequential unified-memory access tops out at
    // ~60% of theoretical peak bandwidth in real LLM workloads — see
    // efficiencyPresets in AvailableHardware.tsx. The dropdown must
    // auto-pick the "Unified" button on preset selection.
    for (const preset of applePresets) {
      expect(preset.hosting.efficiency, `${preset.id} efficiency`).toBe("60");
    }
  });
});

describe("HARDWARE_PRESETS — discrete GPU presets", () => {
  const gpuPresets = HARDWARE_PRESETS.filter(
    (p) =>
      p.category === "nvidia_datacenter" ||
      p.category === "nvidia_consumer" ||
      p.category === "amd_datacenter",
  );

  it("sets gpuCount=1 (single-card; user dials count manually)", () => {
    for (const preset of gpuPresets) {
      expect(preset.hosting.gpuCount, `${preset.id} gpuCount`).toBe("1");
    }
  });

  it("fills VRAM, bandwidth and a non-empty model identifier", () => {
    for (const preset of gpuPresets) {
      const vram = parseFloat(preset.hosting.gpuVram ?? "");
      const bw = parseFloat(preset.hosting.gpuBandwidth ?? "");
      expect(vram, `${preset.id} gpuVram`).toBeGreaterThan(0);
      expect(bw, `${preset.id} gpuBandwidth`).toBeGreaterThan(0);
      expect(preset.hosting.gpuInfo ?? "").not.toBe("");
    }
  });

  it("clears unified-memory fields so switching Apple → GPU normalises state", () => {
    // After picking M5 Max then switching to RTX 4090, leaving stale
    // `cpuModel: "Apple M5 Max"` next to a freshly-applied GPU is
    // confusing. Every GPU preset explicitly empties the host RAM/CPU
    // block listed below; users with a real hybrid host (EPYC + H100)
    // re-enter those fields after picking the GPU preset and the
    // dropdown auto-switches to Custom.
    const clearedFields: (keyof HostingData)[] = [
      "cpuModel",
      "ramType",
      "ramBandwidthGBs",
      "availableRam",
    ];
    for (const preset of gpuPresets) {
      for (const field of clearedFields) {
        expect(
          preset.hosting[field],
          `${preset.id} should clear ${field} to ""`,
        ).toBe("");
      }
    }
  });

  it("never touches truly orthogonal host fields (cpuCores/cpuFreqGHz/storageType)", () => {
    // These are not in PRESET_OWNED_FIELDS — they're free-form and the
    // user typically fills them once for their machine and expects
    // them to survive every preset switch.
    const untouchedFields: (keyof HostingData)[] = [
      "cpuCores",
      "cpuFreqGHz",
      "storageType",
      "availableStorage",
      "notes",
      "price",
    ];
    for (const preset of gpuPresets) {
      for (const field of untouchedFields) {
        expect(
          preset.hosting[field],
          `${preset.id} should not write ${field}`,
        ).toBeUndefined();
      }
    }
  });

  it("sets BW efficiency to 80% (discrete-GPU HBM/GDDR access pattern)", () => {
    for (const preset of gpuPresets) {
      expect(preset.hosting.efficiency, `${preset.id} efficiency`).toBe("80");
    }
  });
});

describe("HARDWARE_PRESETS — sample bandwidth numbers (datasheet sanity)", () => {
  // Spot-check a handful of headline numbers so a typo in the catalog
  // (e.g. "8000" → "800") fails fast in CI rather than misleading users.
  const expected: ReadonlyArray<readonly [string, string]> = [
    ["m1-max", "400"],
    ["m5-max", "614"],
    ["m3-ultra", "819"],
    ["h100-sxm", "3350"],
    ["h200", "4800"],
    ["b200", "8000"],
    ["rtx-4090", "1008"],
    ["rtx-5090", "1792"],
    ["mi300x", "5300"],
    ["mi325x", "6000"],
  ];

  it.each(expected)(
    "preset %s has bandwidth %s GB/s (verified from datasheet)",
    (id, expectedBw) => {
      const preset = HARDWARE_PRESETS.find((p) => p.id === id);
      expect(preset, `preset ${id} missing`).toBeDefined();
      // GPU presets clear ramBandwidthGBs to "" (not undefined) to
      // normalise state on Apple→GPU switch — fall through on empty
      // string too, not just null/undefined.
      const ramBw = preset!.hosting.ramBandwidthGBs;
      const bw = ramBw && ramBw !== "" ? ramBw : preset!.hosting.gpuBandwidth;
      expect(bw).toBe(expectedBw);
    },
  );
});

describe("getHardwarePresetGroups", () => {
  it("returns categories in the declaration order of HARDWARE_CATEGORY_LABELS", () => {
    const groups = getHardwarePresetGroups();
    const expectedOrder = Object.keys(HARDWARE_CATEGORY_LABELS);
    expect(groups.map((g) => g.category)).toEqual(expectedOrder);
  });

  it("partitions every preset into exactly one group", () => {
    const groups = getHardwarePresetGroups();
    const total = groups.reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBe(HARDWARE_PRESETS.length);
  });

  it("never produces an empty group (every category has presets)", () => {
    for (const group of getHardwarePresetGroups()) {
      expect(group.items.length, `category ${group.category}`).toBeGreaterThan(
        0,
      );
    }
  });
});

describe("resolveActiveHardware", () => {
  it("returns null when storedId is the CUSTOM sentinel (force custom)", () => {
    const preset = HARDWARE_PRESETS[0]!;
    const hosting = apply(preset);
    expect(
      resolveActiveHardware(hosting, CUSTOM_HARDWARE_ID),
    ).toBeNull();
  });

  it("returns null for an unknown id even when fields would otherwise match", () => {
    const preset = HARDWARE_PRESETS[0]!;
    const hosting = apply(preset);
    expect(
      resolveActiveHardware(hosting, "no-such-preset"),
    ).toBeNull();
  });

  it("matches by stored id when every preset field is in sync", () => {
    for (const preset of HARDWARE_PRESETS) {
      const hosting = apply(preset);
      expect(
        resolveActiveHardware(hosting, preset.id),
        `${preset.id} round-trip`,
      ).toBe(preset);
    }
  });

  it("returns null when storedId matches a preset but a field is out of sync", () => {
    // Simulates "user picked H100 then manually changed VRAM" — the
    // dropdown must NOT keep showing "H100" with a wrong VRAM number.
    const preset = HARDWARE_PRESETS.find((p) => p.id === "h100-sxm")!;
    const hosting = apply(preset);
    const desynced: HostingData = { ...hosting, gpuVram: "999" };
    expect(resolveActiveHardware(desynced, preset.id)).toBeNull();
  });

  it("falls back to value-based matching when storedId is undefined (legacy URL)", () => {
    // Pre-`hardwarePresetId` shared links must still light up the dropdown
    // when their numeric fields happen to match a known preset.
    const preset = HARDWARE_PRESETS.find((p) => p.id === "rtx-4090")!;
    const hosting = { ...baseHosting, ...preset.hosting };
    expect(resolveActiveHardware(hosting, undefined)).toBe(preset);
  });

  it("returns null when fields don't match any preset (fully custom config)", () => {
    const exotic: HostingData = {
      ...baseHosting,
      gpuCount: "3",
      gpuVram: "13",
      gpuBandwidth: "777",
      gpuInfo: "Custom Frankenstein",
    };
    expect(resolveActiveHardware(exotic, undefined)).toBeNull();
  });
});
