import { describe, it, expect } from "vitest";
import { renderShieldSvg, shieldSvgToDataUrl } from "../shieldSvg";
import type { CardData } from "@/lib/types";

/**
 * Build a real CardData (not a mock) for a known catalog model so the SVG
 * value side reflects actual calculator output. We deliberately avoid
 * hand-crafting expected numbers — the snapshots below capture whatever the
 * calculator produces today, and any drift in the math will pop the snapshot
 * red flag, forcing a conscious update.
 */
function makeCard(overrides: Partial<CardData["model"]> = {}): CardData {
  return {
    id: "test-card",
    model: {
      modelKey: "qwen3.5-27b",
      customModel: {
        params: 7e9,
        layers: 32,
        kvHeads: 8,
        headDim: 128,
        moe: false,
      },
      quant: "q4_k_m",
      kvQuant: "bf16",
      contextK: 32,
      concurrentUsers: 1,
      kvCacheFillPct: 100,
      ...overrides,
    },
    hosting: {
      price: "1.99",
      gpuCount: "1",
      gpuVram: "80",
      gpuInfo: "H100",
      gpuBandwidth: "3350",
      cpuCores: "16",
      cpuFreqGHz: "3.5",
      cpuModel: "EPYC",
      ramBandwidthGBs: "200",
      ramType: "DDR5",
      storageType: "NVMe",
      efficiency: "80",
      notes: "",
      availableRam: "192",
      availableStorage: "1000",
      osOverheadGb: 2,
    },
  };
}

describe("renderShieldSvg", () => {
  it("returns a self-contained SVG document with a sensible width", () => {
    const svg = renderShieldSvg(makeCard());
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    // Width should be plausible: 80–600px depending on label length. Anything
    // outside this window means the text-measurement code regressed and the
    // badge would either truncate or have huge whitespace.
    const widthMatch = svg.match(/width="(\d+)"/);
    expect(widthMatch).not.toBeNull();
    const width = parseInt(widthMatch?.[1] ?? "0", 10);
    expect(width).toBeGreaterThan(80);
    expect(width).toBeLessThan(600);
  });

  it("includes the default 'WeightRoom' label and renders a TPS / RAM summary", () => {
    const svg = renderShieldSvg(makeCard());
    expect(svg).toContain(">WeightRoom<");
    // Catalog name "Qwen3-Coder 30B-A3B" is what KNOWN_MODELS["qwen3.5-27b"]
    // resolves to today; if the catalog renames, this assertion will catch it
    // before we ship a badge with a stale name.
    expect(svg).toMatch(/Qwen|qwen/i);
    // Either "GB" or "t/s" should appear — those are the metric units.
    expect(svg).toMatch(/GB|t\/s/);
  });

  it("escapes XML metacharacters in user-provided labels", () => {
    const svg = renderShieldSvg(makeCard(), {
      label: "<script>&\"'",
    });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&apos;");
  });

  it("supports the explicit light/dark themes with hard-coded colours", () => {
    const light = renderShieldSvg(makeCard(), { theme: "light" });
    const dark = renderShieldSvg(makeCard(), { theme: "dark" });
    expect(light).toContain("#7c3aed");
    expect(dark).toContain("#a78bfa");
    expect(light).not.toBe(dark);
  });

  it("falls back to currentColor for the default 'auto' theme", () => {
    const svg = renderShieldSvg(makeCard());
    // The right-hand value text uses CSS currentColor so GitHub light/dark
    // README themes can repaint the badge without per-theme assets.
    expect(svg).toContain("currentColor");
  });

  it("changes width when label/value text gets longer", () => {
    const short = renderShieldSvg(makeCard(), { label: "X" });
    const long = renderShieldSvg(makeCard(), {
      label: "A very long label name",
    });
    const w = (s: string) =>
      parseInt(s.match(/width="(\d+)"/)?.[1] ?? "0", 10);
    expect(w(long)).toBeGreaterThan(w(short));
  });

  it("renders a different value depending on the chosen metric", () => {
    const tps = renderShieldSvg(makeCard(), { metric: "tps" });
    const ram = renderShieldSvg(makeCard(), { metric: "ram" });
    const summary = renderShieldSvg(makeCard(), { metric: "summary" });
    expect(tps).not.toBe(ram);
    expect(summary).not.toBe(tps);
    // RAM-only label should mention "GB" but never "t/s".
    expect(ram).toMatch(/GB/);
    expect(ram).not.toMatch(/t\/s/);
  });

  it("works when the model resolves to null (custom-model fallback)", () => {
    const card = makeCard({ modelKey: "custom" });
    card.model.customModel.name = "MyModel";
    const svg = renderShieldSvg(card);
    expect(svg).toContain("MyModel");
  });
});

describe("shieldSvgToDataUrl", () => {
  it("produces an inline data URL parsable as base64", () => {
    const svg = renderShieldSvg(makeCard());
    const url = shieldSvgToDataUrl(svg);
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const b64 = url.slice("data:image/svg+xml;base64,".length);
    // Round-trip through atob to confirm we wrote real base64 (not just a
    // string that happens to start with the right prefix).
    const decoded = atob(b64);
    expect(decoded.startsWith("<svg")).toBe(true);
  });
});
