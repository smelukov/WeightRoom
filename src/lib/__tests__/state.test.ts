import { describe, it, expect } from "vitest";
import { encodeState, decodeState } from "../state";
import type { SavedState } from "../state";

const minimalCard = {
  id: "test-id-1",
  model: {
    modelKey: "qwen3.5-27b",
    customModel: {
      params: 7e9,
      layers: 32,
      kvHeads: 8,
      headDim: 128,
      moe: false,
    },
    quant: "q4_k_m" as const,
    kvQuant: "bf16" as const,
    contextK: 32,
    concurrentUsers: 1,
    kvCacheFillPct: 100,
  },
  hosting: {
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
  },
};

describe("encodeState", () => {
  it("returns a non-empty string for a valid state", () => {
    const encoded = encodeState({ mode: "single", configs: [minimalCard] });
    expect(encoded).toBeTruthy();
    expect(typeof encoded).toBe("string");
  });

  it("produces URL-safe base64 (no +, /, or = characters)", () => {
    const encoded = encodeState({ mode: "single", configs: [minimalCard] });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("produces different output for different states", () => {
    const a = encodeState({ mode: "single", configs: [minimalCard] });
    const b = encodeState({
      mode: "compare",
      configs: [minimalCard, { ...minimalCard, id: "test-id-2" }],
    });
    expect(a).not.toBe(b);
  });
});

describe("decodeState", () => {
  it("round-trips a 'single' mode state correctly", () => {
    const original: SavedState = { mode: "single", configs: [minimalCard] };
    const decoded = decodeState(encodeState(original));
    expect(decoded).toEqual(original);
  });

  it("round-trips a 'compare' mode state with multiple cards", () => {
    const original: SavedState = {
      mode: "compare",
      configs: [
        minimalCard,
        { ...minimalCard, id: "test-id-2" },
        { ...minimalCard, id: "test-id-3" },
      ],
    };
    const decoded = decodeState(encodeState(original));
    expect(decoded).toEqual(original);
    expect(decoded!.configs.length).toBe(3);
  });

  it("returns null for an empty string", () => {
    expect(decodeState("")).toBeNull();
  });

  it("returns null for a completely invalid string", () => {
    expect(decodeState("not-valid-base64!!!")).toBeNull();
  });

  it("returns null for valid base64 that is not valid JSON", () => {
    const garbage = btoa("this is not json").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeState(garbage)).toBeNull();
  });

  it("returns null when configs array is empty", () => {
    const stateWithEmptyConfigs = { mode: "single", configs: [] };
    const encoded = btoa(JSON.stringify(stateWithEmptyConfigs))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(decodeState(encoded)).toBeNull();
  });

  it("returns null when configs key is missing", () => {
    const noConfigs = { mode: "single" };
    const encoded = btoa(JSON.stringify(noConfigs))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(decodeState(encoded)).toBeNull();
  });

  it("handles Unicode content (non-ASCII model names) correctly", () => {
    const stateWithUnicode: SavedState = {
      mode: "single",
      configs: [
        {
          ...minimalCard,
          hosting: { ...minimalCard.hosting, notes: "Запуск на сервере 测试" },
        },
      ],
    };
    const decoded = decodeState(encodeState(stateWithUnicode));
    expect(decoded?.configs[0]?.hosting.notes).toBe("Запуск на сервере 测试");
  });
});

// ─── Golden URLs (backward compatibility) ────────────────────────────────────
// The values below are committed verbatim and must decode forever. A
// breakage here means every previously-shared link would 404 (or silently
// decode to the wrong config) — an OSS-user-visible regression.
//
// Adding new tests here is cheap; "updating" a golden to match a new
// encoding is a RED FLAG. If we ever need to evolve the format, version it
// and keep these tests passing by handling legacy payloads in decodeState.

describe("decodeState (golden URLs)", () => {
  it("round-trips a 'single' snapshot and emits URL-safe base64", () => {
    const expected: SavedState = { mode: "single", configs: [minimalCard] };
    const golden = encodeState(expected);
    expect(golden).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(golden).not.toMatch(/[+/=]/);
    expect(decodeState(golden)).toEqual(expected);
  });

  it("round-trips a 'compare' snapshot with two cards", () => {
    const expected: SavedState = {
      mode: "compare",
      configs: [minimalCard, { ...minimalCard, id: "golden-2" }],
    };
    const golden = encodeState(expected);
    expect(golden).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeState(golden)).toEqual(expected);
  });

  it("preserves Unicode (Cyrillic + CJK) end-to-end (regression guard)", () => {
    const cardWithNotes = {
      ...minimalCard,
      hosting: { ...minimalCard.hosting, notes: "Тестовый сервер 日本語" },
    };
    const state: SavedState = { mode: "single", configs: [cardWithNotes] };
    const encoded = encodeState(state);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeState(encoded)?.configs[0]?.hosting.notes).toBe(
      "Тестовый сервер 日本語",
    );
  });
  it("decodes a hard-coded historical payload (true cross-version golden)", () => {
    // This base64url string was produced from a real previous build.
    // If encodeState ever changes shape (field renames, key reordering,
    // compression, etc.), this assertion will fail and we will know we
    // are about to break every existing shared link.
    const HISTORICAL_GOLDEN =
      "eyJtb2RlIjoic2luZ2xlIiwiY29uZmlncyI6W3siaWQiOiJnb2xkZW4taWQtMSIsIm1vZGVsIjp7Im1vZGVsS2V5IjoicXdlbjMuNS0yN2IiLCJjdXN0b21Nb2RlbCI6eyJwYXJhbXMiOjcwMDAwMDAwMDAsImxheWVycyI6MzIsImt2SGVhZHMiOjgsImhlYWREaW0iOjEyOCwibW9lIjpmYWxzZX0sInF1YW50IjoicTRfa19tIiwia3ZRdWFudCI6ImJmMTYiLCJjb250ZXh0SyI6MzIsImNvbmN1cnJlbnRVc2VycyI6MSwia3ZDYWNoZUZpbGxQY3QiOjEwMH0sImhvc3RpbmciOnsicHJpY2UiOiIiLCJncHVDb3VudCI6IiIsImdwdVZyYW0iOiIiLCJncHVJbmZvIjoiIiwiZ3B1QmFuZHdpZHRoIjoiIiwiY3B1Q29yZXMiOiIiLCJjcHVGcmVxR0h6IjoiIiwiY3B1TW9kZWwiOiIiLCJyYW1CYW5kd2lkdGhHQnMiOiIiLCJyYW1UeXBlIjoiIiwic3RvcmFnZVR5cGUiOiIiLCJlZmZpY2llbmN5IjoiODAiLCJub3RlcyI6IiIsImF2YWlsYWJsZVJhbSI6IiIsImF2YWlsYWJsZVN0b3JhZ2UiOiIiLCJvc092ZXJoZWFkR2IiOjJ9fV19";
    const decoded = decodeState(HISTORICAL_GOLDEN);
    expect(decoded).not.toBeNull();
    expect(decoded?.mode).toBe("single");
    expect(decoded?.configs.length).toBe(1);
    const c = decoded?.configs[0];
    expect(c).toBeDefined();
    if (!c) return;
    expect(c.id).toBe("golden-id-1");
    expect(c.model.modelKey).toBe("qwen3.5-27b");
    expect(c.model.quant).toBe("q4_k_m");
    expect(c.model.contextK).toBe(32);
    expect(c.hosting.osOverheadGb).toBe(2);
  });
});
