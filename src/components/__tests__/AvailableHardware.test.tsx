import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvailableHardware } from "../AvailableHardware";
import type { DiskResult } from "@/lib/calculator";
import {
  CUSTOM_HARDWARE_ID,
  HARDWARE_PRESETS,
} from "@/lib/hardwarePresets";
import type { HostingData } from "@/lib/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

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

const baseDisk: DiskResult = {
  modelFileGb: 12,
  osOverheadGb: 20,
  totalGb: 32,
};

interface RenderOpts {
  hosting?: Partial<HostingData>;
  showHosting?: boolean;
}

/**
 * Render with a stateful wrapper so user interactions actually mutate
 * `hosting` between events — the component is normally controlled by
 * its parent, and tests that exercise "edit a field, then check the
 * dropdown" need to see the propagated state, not the original prop.
 *
 * The mutation of `handle` happens inside the `onHostingChange`
 * callback (an event handler, not a render path), which is why this
 * pattern is safe with `react-hooks/globals`.
 */
function renderHardware(opts: RenderOpts = {}) {
  const handle: { current: HostingData } = {
    current: { ...baseHosting, ...opts.hosting },
  };
  function Wrapper() {
    const [hosting, setHosting] = useState<HostingData>(handle.current);
    return (
      <AvailableHardware
        totalRamGb={20}
        modelMemoryGb={20}
        disk={baseDisk}
        hosting={hosting}
        onHostingChange={(next) => {
          handle.current = next;
          setHosting(next);
        }}
        showHosting={opts.showHosting ?? false}
      />
    );
  }
  const utils = render(<Wrapper />);
  return {
    ...utils,
    getHosting: () => handle.current,
  };
}

const presetTrigger = () => screen.getByTestId("hardware-preset-trigger");

// ─── Tests: dropdown is rendered in both modes ─────────────────────────────

describe("AvailableHardware — preset Select renders in both modes", () => {
  it("shows the dropdown in consumer mode (showHosting=false)", () => {
    renderHardware({ showHosting: false });
    expect(presetTrigger()).toBeInTheDocument();
  });

  it("shows the dropdown in hosting mode (showHosting=true)", () => {
    renderHardware({ showHosting: true });
    expect(presetTrigger()).toBeInTheDocument();
  });

  it("defaults to 'Custom' label when no fields match any preset", () => {
    renderHardware();
    expect(presetTrigger()).toHaveTextContent("Custom");
  });
});

// ─── Tests: selecting a preset fills the hosting fields ────────────────────

describe("AvailableHardware — selecting a preset fills hosting fields", () => {
  it("selecting H100 SXM (hosting mode) sets gpuCount=1, VRAM=80, BW=3350", async () => {
    const user = userEvent.setup();
    const { getHosting } = renderHardware({ showHosting: true });

    await user.click(presetTrigger());
    const option = await screen.findByRole("option", {
      name: /NVIDIA H100 SXM 80GB/,
    });
    await user.click(option);

    const hosting = getHosting();
    expect(hosting.hardwarePresetId).toBe("h100-sxm");
    expect(hosting.gpuCount).toBe("1");
    expect(hosting.gpuVram).toBe("80");
    expect(hosting.gpuBandwidth).toBe("3350");
    expect(hosting.gpuInfo).toBe("H100 SXM 80GB");
    // Discrete GPU → BW efficiency snaps to "GPU" (80%).
    expect(hosting.efficiency).toBe("80");
    // Switching to a GPU preset must also CLEAR any leftover Apple
    // unified-memory block so the dropdown's preset matches reality.
    expect(hosting.cpuModel).toBe("");
    expect(hosting.ramType).toBe("");
    expect(hosting.ramBandwidthGBs).toBe("");
    expect(hosting.availableRam).toBe("");
  });

  it("selecting M3 Ultra (consumer mode) sets RAM=512, BW=819, zeros GPU block", async () => {
    const user = userEvent.setup();
    const { getHosting } = renderHardware({ showHosting: false });

    await user.click(presetTrigger());
    const option = await screen.findByRole("option", {
      name: /Apple M3 Ultra/,
    });
    await user.click(option);

    const hosting = getHosting();
    expect(hosting.hardwarePresetId).toBe("m3-ultra");
    expect(hosting.availableRam).toBe("512");
    expect(hosting.ramBandwidthGBs).toBe("819");
    expect(hosting.ramType).toBe("LPDDR5X");
    expect(hosting.cpuModel).toBe("Apple M3 Ultra");
    // Apple Silicon: GPU branch must be zeroed so calcValueScore takes
    // the unified-memory path.
    expect(hosting.gpuCount).toBe("0");
    expect(hosting.gpuVram).toBe("0");
    expect(hosting.gpuBandwidth).toBe("0");
    expect(hosting.gpuInfo).toBe("");
    // Apple Silicon → BW efficiency snaps to "Unified" (60%).
    expect(hosting.efficiency).toBe("60");
  });

  it("preserves truly orthogonal fields (price, notes, storage) on preset select", async () => {
    const user = userEvent.setup();
    const { getHosting } = renderHardware({
      showHosting: true,
      hosting: {
        price: "1500",
        notes: "my-server",
        availableStorage: "1000",
        cpuCores: "32",
        cpuFreqGHz: "3.5",
      },
    });

    await user.click(presetTrigger());
    const option = await screen.findByRole("option", {
      name: /NVIDIA RTX 4090/,
    });
    await user.click(option);

    const hosting = getHosting();
    // Fields outside PRESET_OWNED_FIELDS must survive — picking a card
    // can't silently wipe the price tag, notes or storage layout.
    expect(hosting.price).toBe("1500");
    expect(hosting.notes).toBe("my-server");
    expect(hosting.availableStorage).toBe("1000");
    expect(hosting.cpuCores).toBe("32");
    expect(hosting.cpuFreqGHz).toBe("3.5");
    expect(hosting.gpuInfo).toBe("RTX 4090");
  });
});

// ─── Tests: dropdown reflects current state via resolveActiveHardware ──────

describe("AvailableHardware — dropdown label tracks active preset", () => {
  it("shows the preset label when hardwarePresetId is set and fields match", () => {
    const preset = HARDWARE_PRESETS.find((p) => p.id === "rtx-4090")!;
    renderHardware({
      showHosting: true,
      hosting: { ...preset.hosting, hardwarePresetId: preset.id },
    });
    expect(presetTrigger()).toHaveTextContent("NVIDIA RTX 4090");
  });

  it("BACKWARD-COMPAT: matches by field values when hardwarePresetId is undefined", () => {
    // Pre-`hardwarePresetId` shared link — values match A100 80GB but no id.
    const preset = HARDWARE_PRESETS.find((p) => p.id === "a100-80")!;
    renderHardware({
      showHosting: true,
      hosting: { ...preset.hosting },
    });
    expect(presetTrigger()).toHaveTextContent("NVIDIA A100 80GB SXM");
  });
});

// ─── Tests: manual edits flip the dropdown to Custom ───────────────────────

describe("AvailableHardware — manual edits switch to Custom", () => {
  it("editing gpuVram after applying a preset stamps hardwarePresetId='custom'", async () => {
    const user = userEvent.setup();
    const { getHosting } = renderHardware({ showHosting: true });

    await user.click(presetTrigger());
    const option = await screen.findByRole("option", { name: /NVIDIA H200/ });
    await user.click(option);
    expect(getHosting().hardwarePresetId).toBe("h200");

    // Find the VRAM input. The label is "VRAM (GB)" inside a `Field`,
    // and the input has placeholder "e.g. 80".
    const vramInput = screen.getByPlaceholderText("e.g. 80");
    fireEvent.change(vramInput, { target: { value: "999" } });

    const hosting = getHosting();
    expect(hosting.hardwarePresetId).toBe(CUSTOM_HARDWARE_ID);
    expect(hosting.gpuVram).toBe("999");
    // Other preset-controlled fields must NOT be cleared — only the
    // label changes; the user can keep iterating from the H200 baseline.
    expect(hosting.gpuBandwidth).toBe("4800");
    expect(presetTrigger()).toHaveTextContent("Custom");
  });

  it("editing efficiency (preset-owned) switches the dropdown to Custom", async () => {
    const user = userEvent.setup();
    const preset = HARDWARE_PRESETS.find((p) => p.id === "h100-sxm")!;
    const { getHosting } = renderHardware({
      showHosting: true,
      hosting: { ...preset.hosting, hardwarePresetId: preset.id },
    });
    expect(presetTrigger()).toHaveTextContent("NVIDIA H100 SXM 80GB");

    // The CPU preset is non-default (65%) — picking it both mutates
    // efficiency AND must release the H100 preset, since efficiency is
    // intentionally part of the preset (Apple Unified is 60%, discrete
    // GPU is 80%, and the user's manual choice overrides whichever).
    const cpuButton = screen.getByRole("button", { name: "CPU" });
    await user.click(cpuButton);

    const hosting = getHosting();
    expect(hosting.efficiency).toBe("65");
    expect(hosting.hardwarePresetId).toBe(CUSTOM_HARDWARE_ID);
    expect(presetTrigger()).toHaveTextContent("Custom");
  });

  it("editing availableStorage (orthogonal field) keeps the preset active", () => {
    const preset = HARDWARE_PRESETS.find((p) => p.id === "rtx-3090")!;
    const { getHosting } = renderHardware({
      showHosting: true,
      hosting: { ...preset.hosting, hardwarePresetId: preset.id },
    });
    expect(presetTrigger()).toHaveTextContent("NVIDIA RTX 3090");

    const storageInput = screen.getByPlaceholderText("e.g. 500");
    fireEvent.change(storageInput, { target: { value: "2000" } });

    const hosting = getHosting();
    expect(hosting.availableStorage).toBe("2000");
    expect(hosting.hardwarePresetId).toBe(preset.id);
  });
});

// ─── Tests: explicit Custom selection ──────────────────────────────────────

describe("AvailableHardware — selecting Custom from the dropdown", () => {
  it("stamps hardwarePresetId='custom' without touching other fields", async () => {
    const user = userEvent.setup();
    const preset = HARDWARE_PRESETS.find((p) => p.id === "h100-sxm")!;
    const { getHosting } = renderHardware({
      showHosting: true,
      hosting: { ...preset.hosting, hardwarePresetId: preset.id },
    });

    await user.click(presetTrigger());
    const customOption = await screen.findByRole("option", { name: "Custom" });
    await user.click(customOption);

    const hosting = getHosting();
    expect(hosting.hardwarePresetId).toBe(CUSTOM_HARDWARE_ID);
    // The numeric fields the user might still want to keep tweaking
    // must remain — we only flip the label to release the preset lock.
    expect(hosting.gpuVram).toBe("80");
    expect(hosting.gpuBandwidth).toBe("3350");
  });
});
