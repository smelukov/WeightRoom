import { useMemo, useState, memo, type RefObject } from "react";
import { ConfigCard } from "./ConfigCard";
import type { CardData } from "@/lib/types";
import { ModelsChart } from "./comparison/ModelsChart";
import { HostingDetailsView } from "./comparison/HostingDetailsView";
import { HostingScatterView } from "./comparison/HostingScatterView";

interface ComparisonPanelProps {
  configs: CardData[];
  onChange: (index: number, config: CardData) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  screenshotRef?: RefObject<HTMLDivElement | null> | undefined;
}

export const ComparisonPanel = memo(function ComparisonPanel({
  configs,
  onChange,
  onAdd,
  onRemove,
  screenshotRef,
}: ComparisonPanelProps) {
  const [chartMode, setChartMode] = useState<"models" | "hosting">("models");
  const [hostingView, setHostingView] = useState<"details" | "strategy">("details");

  // Stable per-card handlers — only recreate when count or onChange changes,
  // not on every content update. This lets React.memo on ConfigCard work.
  const changeHandlers = useMemo(
    () => configs.map((_, i) => (c: CardData) => onChange(i, c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configs.length, onChange],
  );
  const removeHandlers = useMemo(
    () =>
      configs.map((_, i) =>
        configs.length > 1 ? () => onRemove(i) : undefined,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configs.length, onRemove],
  );

  return (
    <div className="space-y-6">
      <div ref={screenshotRef} className="space-y-6">
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(min(420px, 100%), 1fr))",
          }}
        >
          {configs.map((config, i) => {
            // Index lookups are `T | undefined` under noUncheckedIndexedAccess.
            // The handler arrays are sized exactly to `configs.length`, so this
            // is a defensive guard for the type system rather than a real
            // runtime path.
            const onChangeHandler = changeHandlers[i];
            if (!onChangeHandler) return null;
            return (
              <ConfigCard
                key={config.id}
                config={config}
                onChange={onChangeHandler}
                onRemove={removeHandlers[i]}
                showHosting
              />
            );
          })}
        </div>

        {configs.length >= 2 && (
          <div className="rounded-xl bg-card border border-border p-4 min-w-0 overflow-visible">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Comparison Chart
              </h3>
              <div className="flex gap-1 rounded-lg bg-secondary/50 p-0.5">
                {(["models", "hosting"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setChartMode(m)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${
                      chartMode === m
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "models" ? "Models (RAM + Storage)" : "Hosting"}
                  </button>
                ))}
              </div>
            </div>

            {chartMode === "hosting" && (
              <div className="flex gap-1 rounded-lg bg-secondary/50 p-0.5 mb-4 w-fit">
                {(["details", "strategy"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setHostingView(v)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${
                      hostingView === v
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v === "details" ? "Details" : "Strategy"}
                  </button>
                ))}
              </div>
            )}

            <div className="min-w-0 overflow-hidden">
              {chartMode === "models" ? (
                <ModelsChart configs={configs} />
              ) : hostingView === "details" ? (
                <HostingDetailsView configs={configs} />
              ) : (
                <HostingScatterView configs={configs} />
              )}
            </div>
          </div>
        )}
      </div>

      {configs.length < 6 && (
        <button
          onClick={onAdd}
          className="w-full border-2 border-dashed border-border rounded-xl flex items-center justify-center min-h-[80px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors cursor-pointer"
        >
          <div className="text-center">
            <div className="text-2xl mb-0.5">+</div>
            <div className="text-sm">Add Configuration</div>
          </div>
        </button>
      )}
    </div>
  );
});
