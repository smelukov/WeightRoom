import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModelSelector } from "./ModelSelector";
import { CustomModelForm } from "./CustomModelForm";
import { QuantSelector } from "./QuantSelector";
import { ContextSlider } from "./ContextSlider";
import { ConcurrentUsersInput } from "./ConcurrentUsersInput";
import { ResultCard } from "./ResultCard";
import { AvailableHardware } from "./AvailableHardware";
import { Separator } from "@/components/ui/separator";
import { calcDisk } from "@/lib/calculator";
import { resolveModel } from "@/lib/calcInput";
import { KNOWN_MODELS } from "@/lib/models";
import { downloadScreenshot, buildCardFilename } from "@/lib/screenshot";
import type { CardData, ModelSettings, HostingData } from "@/lib/types";
import { memo, useRef, useState } from "react";
import { LuCamera, LuLoader } from "react-icons/lu";
import { useCalcResult } from "@/hooks/useCalcResult";
import { useValueScore } from "@/hooks/useValueScore";

interface ConfigCardProps {
  config: CardData;
  onChange: (config: CardData) => void;
  // `| undefined` is needed under exactOptionalPropertyTypes so callers can
  // pass `onRemove={maybeUndefined}` (e.g. ComparisonPanel disables removal
  // when only one card remains).
  onRemove?: (() => void) | undefined;
  showHosting?: boolean | undefined;
}

const DEFAULT_MAX_K = 256;

export const ConfigCard = memo(function ConfigCard({
  config,
  onChange,
  onRemove,
  showHosting = false,
}: ConfigCardProps) {
  const result = useCalcResult(config);
  const { tps, tpsSystem } = useValueScore(config);

  const model = resolveModel(config);
  const disk = model
    ? calcDisk(model.params, config.model.quant)
    : { modelFileGb: 0, osOverheadGb: 20, totalGb: 20 };

  const knownModel =
    config.model.modelKey !== "custom" ? KNOWN_MODELS[config.model.modelKey] : null;
  const maxK =
    knownModel?.maxContextK ?? config.model.customMaxK ?? DEFAULT_MAX_K;

  const [autoImportUrl, setAutoImportUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const updateModel = (partial: Partial<ModelSettings>) =>
    onChange({ ...config, model: { ...config.model, ...partial } });
  const updateHosting = (partial: Partial<HostingData>) =>
    onChange({ ...config, hosting: { ...config.hosting, ...partial } });

  async function handleScreenshot() {
    if (!cardRef.current || capturing) return;
    setCapturing(true);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    try {
      const modelName =
        config.model.modelKey === "custom"
          ? (config.model.customModel.name || "custom")
          : (knownModel?.displayName ?? config.model.modelKey);
      await downloadScreenshot(
        cardRef.current!,
        buildCardFilename(modelName, config.model.quant, config.model.contextK),
      );
    } finally {
      setCapturing(false);
    }
  }

  return (
    <Card ref={cardRef} className="relative overflow-visible">
      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          onClick={handleScreenshot}
          disabled={capturing}
          title="Save screenshot"
          aria-label="Save screenshot of this card"
        >
          {capturing
            ? <LuLoader className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : <LuCamera className="h-3.5 w-3.5" aria-hidden="true" />}
        </Button>
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            onClick={onRemove}
            aria-label="Remove this card"
            title="Remove card"
          >
            <span aria-hidden="true">×</span>
          </Button>
        )}
      </div>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <ModelSelector
          value={config.model.modelKey}
          onChange={(modelKey) => {
            const newMaxK =
              modelKey !== "custom"
                ? (KNOWN_MODELS[modelKey]?.maxContextK ?? DEFAULT_MAX_K)
                : (config.model.customMaxK ?? DEFAULT_MAX_K);
            const contextK = Math.min(config.model.contextK, newMaxK);
            updateModel({ modelKey, contextK });
          }}
          // NOTE: KNOWN_MODELS is still referenced once here, inside the
          // handler, because we need to look up maxContextK for the NEW
          // selection (before config state actually updates). Pulling this
          // into a helper would just obscure the flow.
          onHfUrl={(url) => {
            // Single onChange to avoid stacking two updates on the same
            // stale `config` snapshot. The follow-up doImport runs from
            // CustomModelForm's effect once `autoImportUrl` triggers it.
            onChange({
              ...config,
              hfImportUrl: url,
              model: { ...config.model, modelKey: "custom" },
            });
            setAutoImportUrl(url);
          }}
        />

        {config.model.modelKey === "custom" && (
          <CustomModelForm
            value={config.model.customModel}
            onChange={(customModel) => updateModel({ customModel })}
            hfImportUrl={config.hfImportUrl ?? ""}
            onHfImportUrlChange={(hfImportUrl) => onChange({ ...config, hfImportUrl })}
            onImport={(
              customModel,
              customMaxK,
              detectedPrecision,
              importedFromUrl,
            ) =>
              onChange({
                ...config,
                hfImportUrl: importedFromUrl,
                model: {
                  ...config.model,
                  customModel,
                  customMaxK,
                  // Clamp contextK to the newly-imported model's max context
                  // (e.g. switching from 128K Llama to a 32K Gemma leaves
                  // contextK > customMaxK, which would otherwise persist in
                  // URL state).
                  contextK: Math.min(config.model.contextK, customMaxK),
                  ...(detectedPrecision ? { quant: detectedPrecision } : {}),
                },
              })
            }
            importUrl={autoImportUrl}
            onImportUrlConsumed={() => setAutoImportUrl(null)}
          />
        )}

        <QuantSelector
          quant={config.model.quant}
          kvQuant={config.model.kvQuant}
          onQuantChange={(quant) => updateModel({ quant })}
          onKvQuantChange={(kvQuant) => updateModel({ kvQuant })}
        />

        <ContextSlider
          value={config.model.contextK}
          maxK={maxK}
          onChange={(contextK) => updateModel({ contextK })}
        />

        <ConcurrentUsersInput
          concurrentUsers={config.model.concurrentUsers ?? 1}
          kvCacheFillPct={config.model.kvCacheFillPct ?? 100}
          engineId={config.model.engineId}
          onConcurrentUsersChange={(concurrentUsers) => updateModel({ concurrentUsers })}
          onKvCacheFillPctChange={(kvCacheFillPct) =>
            // Typing a custom value implies the user is in custom mode — keep
            // engineId in sync so the dropdown label doesn't lie.
            updateModel({ kvCacheFillPct, engineId: "custom" })
          }
          onEngineChange={(engineId, kvCacheFillPct) =>
            updateModel({ engineId, kvCacheFillPct })
          }
        />

        <Separator />

        <ResultCard
          result={result}
          disk={disk}
          kvFormula={model?.kvFormula}
          concurrentUsers={config.model.concurrentUsers ?? 1}
          kvCacheFillPct={config.model.kvCacheFillPct ?? 100}
        />

        <Separator />

        <AvailableHardware
          totalRamGb={result.totalGb}
          modelMemoryGb={result.weightsGb + result.kvCacheGb}
          disk={disk}
          hosting={config.hosting}
          onHostingChange={updateHosting}
          showHosting={showHosting}
          tps={tps}
          tpsSystem={tpsSystem}
          concurrentUsers={config.model.concurrentUsers ?? 1}
        />
      </CardContent>
    </Card>
  );
});
