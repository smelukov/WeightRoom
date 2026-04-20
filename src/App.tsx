import { useState, useCallback, useEffect, useRef } from "react";

// NOTE: skipSave ref was removed in a previous refactor because no code path
// ever set it to true. If you need to suppress URL persistence for one update
// in the future, put the flag back — don't leak unrelated side effects into
// setters.
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/Header";
import { ConfigCard } from "@/components/ConfigCard";
import { ComparisonPanel } from "@/components/ComparisonPanel";
import { Footer } from "@/components/Footer";
import {
  downloadScreenshot,
  copyScreenshotToClipboard,
  buildCompareFilename,
} from "@/lib/screenshot";
import type { CardData } from "@/lib/types";
import { encodeState, decodeState } from "@/lib/state";
import type { SavedState } from "@/lib/state";

function createConfig(): CardData {
  return {
    id: crypto.randomUUID(),
    hfImportUrl: "",
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
      engineId: "llamacpp",
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
}

function loadFromUrl(): SavedState | null {
  const params = new URLSearchParams(window.location.search);
  const s = params.get("s");
  return s ? decodeState(s) : null;
}

function saveToUrl(state: SavedState) {
  const encoded = encodeState(state);
  const url = encoded ? `?s=${encoded}` : window.location.pathname;
  window.history.replaceState(null, "", url);
}

export default function App() {
  const initial = loadFromUrl() ?? {
    mode: "single" as const,
    configs: [createConfig()],
  };
  const [mode, setMode] = useState<"single" | "compare">(initial.mode);
  const [configs, setConfigs] = useState<CardData[]>(initial.configs);

  useEffect(() => {
    // Debounce URL writes so typing in a text input doesn't push a new
    // history entry per keystroke. `replaceState` is used, so no new history
    // entries are ever added — only the current URL is updated in place.
    const timer = setTimeout(() => saveToUrl({ mode, configs }), 500);
    return () => clearTimeout(timer);
  }, [mode, configs]);

  const updateConfig = useCallback((index: number, config: CardData) => {
    setConfigs((prev) => prev.map((c, i) => (i === index ? config : c)));
  }, []);

  const addConfig = useCallback(() => {
    setConfigs((prev) => {
      const last = prev[prev.length - 1];
      const base = last ?? createConfig();
      return [
        ...prev,
        {
          ...base,
          id: crypto.randomUUID(),
          hfImportUrl: "",
          hosting: {
            ...base.hosting,
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
            // availableRam, availableStorage, osOverheadGb — сохраняются из base.hosting
          },
        },
      ];
    });
  }, []);

  const removeConfig = useCallback((index: number) => {
    setConfigs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearConfigs = useCallback(() => {
    setConfigs([createConfig()]);
  }, []);

  const compareRef = useRef<HTMLDivElement>(null);
  const [compareCapturing, setCompareCapturing] = useState(false);

  const handleCompareScreenshot = useCallback(
    async (action: "save" | "copy") => {
      if (!compareRef.current || compareCapturing) return;
      setCompareCapturing(true);
      // Two RAF flushes: gives the layout engine a chance to repaint after
      // we set the busy flag (button switches to spinner) so the spinner
      // itself does not end up in the captured PNG.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      try {
        if (action === "save") {
          await downloadScreenshot(compareRef.current, buildCompareFilename());
        } else {
          await copyScreenshotToClipboard(compareRef.current);
        }
      } finally {
        setCompareCapturing(false);
      }
    },
    [compareCapturing],
  );

  return (
    <TooltipProvider>
      <div className="min-h-screen flex flex-col">
        <Header
          mode={mode}
          onModeChange={setMode}
          canClear={mode === "compare" && configs.length > 1}
          onClear={clearConfigs}
          onScreenshot={mode === "compare" ? handleCompareScreenshot : undefined}
          screenshotCapturing={compareCapturing}
        />

        <main className="flex-1 px-4 pb-8 max-w-7xl mx-auto w-full">
          {mode === "single" ? (
            // configs[0] is `CardData | undefined` under noUncheckedIndexedAccess.
            // The list invariant (clearConfigs always re-seeds with one card,
            // single mode never deletes) guarantees it exists, but we still
            // narrow explicitly so the type system is happy and we don't crash
            // if the invariant is ever broken upstream.
            configs[0] ? (
              // Width tuned to fit the Available Hardware section without the
              // 4-column GPU row collapsing labels onto two lines. Was max-w-xl
              // (576px), which forced "VRAM (GB)" / "BW (GB/s)" to wrap and
              // pushed the inputs out of alignment.
              <div className="max-w-2xl mx-auto">
                <ConfigCard
                  config={configs[0]}
                  onChange={(c) => updateConfig(0, c)}
                  showHosting
                />
              </div>
            ) : null
          ) : (
            <ComparisonPanel
              configs={configs}
              onChange={updateConfig}
              onAdd={addConfig}
              onRemove={removeConfig}
              screenshotRef={compareRef}
            />
          )}
        </main>

        <Footer />
      </div>
    </TooltipProvider>
  );
}
