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
import {
  downloadScreenshot,
  copyScreenshotToClipboard,
  buildCardFilename,
} from "@/lib/screenshot";
import { QUANT_FAMILY_ENGINES, getQuantFamily } from "@/lib/quants";
import { pickCompatibleEngine } from "@/lib/enginePresets";
import type {
  CardData,
  ModelSettings,
  HostingData,
  QuantName,
} from "@/lib/types";
import { memo, useRef, useState } from "react";
import {
  LuCamera,
  LuCheck,
  LuClipboard,
  LuDownload,
  LuLoader,
} from "react-icons/lu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [screenshotResult, setScreenshotResult] = useState<
    "saved" | "copied" | null
  >(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const updateModel = (partial: Partial<ModelSettings>) =>
    onChange({ ...config, model: { ...config.model, ...partial } });
  const updateHosting = (partial: Partial<HostingData>) =>
    onChange({ ...config, hosting: { ...config.hosting, ...partial } });

  /**
   * Picking a quant from a different family (e.g. switching GGUF→AWQ) can
   * leave the user looking at an engine preset that no longer exists in the
   * filtered dropdown. Auto-snap to the first compatible preset so the
   * dropdown label and the actual KV % stay in sync — this also avoids a
   * "ghost" engineId that the dropdown can't render.
   *
   * "custom" is intentionally compatible with every family (see
   * QUANT_FAMILY_ENGINES), so the user's manual KV % is never overridden.
   */
  const onQuantChange = (quant: QuantName) => {
    const fallback = pickCompatibleEngine(
      QUANT_FAMILY_ENGINES[getQuantFamily(quant)],
      config.model.engineId,
    );
    updateModel(fallback ? { quant, ...fallback } : { quant });
  };

  async function handleScreenshot(action: "save" | "copy") {
    if (!cardRef.current || capturing) return;
    setCapturing(true);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    try {
      if (action === "save") {
        const modelName =
          config.model.modelKey === "custom"
            ? (config.model.customModel.name || "custom")
            : (knownModel?.displayName ?? config.model.modelKey);
        await downloadScreenshot(
          cardRef.current!,
          buildCardFilename(
            modelName,
            config.model.quant,
            config.model.contextK,
          ),
        );
        setScreenshotResult("saved");
      } else {
        await copyScreenshotToClipboard(cardRef.current!);
        setScreenshotResult("copied");
      }
      setTimeout(() => setScreenshotResult(null), 2000);
    } finally {
      setCapturing(false);
    }
  }

  return (
    <Card ref={cardRef} className="relative overflow-hidden">
      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  disabled={capturing}
                  aria-label={
                    screenshotResult === "saved"
                      ? "Saved!"
                      : screenshotResult === "copied"
                        ? "Copied!"
                        : "Save or copy screenshot of this card"
                  }
                  className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {capturing ? (
                    <LuLoader
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : screenshotResult ? (
                    <LuCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <LuCamera className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </DropdownMenuTrigger>
              }
            />
            <TooltipContent>
              {screenshotResult === "saved"
                ? "Saved!"
                : screenshotResult === "copied"
                  ? "Copied to clipboard"
                  : "Screenshot"}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="min-w-[10rem]"
          >
            <DropdownMenuItem
              onClick={() => handleScreenshot("save")}
              className="gap-2"
            >
              <LuDownload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Save as PNG</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleScreenshot("copy")}
              className="gap-2"
            >
              <LuClipboard className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Copy to clipboard</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onRemove && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  onClick={onRemove}
                  aria-label="Remove this card"
                >
                  <span aria-hidden="true">×</span>
                </Button>
              }
            />
            <TooltipContent>Remove card</TooltipContent>
          </Tooltip>
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
          onQuantChange={onQuantChange}
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
          quant={config.model.quant}
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
