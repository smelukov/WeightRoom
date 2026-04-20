import { LuExternalLink } from "react-icons/lu";
import { calcLLMRam, calcDisk, calcValueScore } from "@/lib/calculator";
import { resolveModel, getCalcOptions, getValueScoreInput } from "@/lib/calcInput";
import { encodeState } from "@/lib/state";
import { KNOWN_MODELS } from "@/lib/models";
import type { CardData } from "@/lib/types";

const CANONICAL_BASE = "https://smelukov.github.io/WeightRoom/";

interface EmbedCardProps {
  card: CardData;
}

/**
 * Format an integer like 12345 as "12.3K", 1234567 as "1.2M". Used for the
 * TPS hero metric: at 1000+ tok/s the trailing digits start to mislead the
 * reader (the roof-line model is not that precise), so we condense the label.
 */
function formatTps(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  }
  if (value >= 100) return Math.round(value).toString();
  return value.toFixed(1);
}

/** Short hardware summary (1–2 line) for the embed header. */
function describeHardware(card: CardData): string {
  const { hosting } = card;
  const gpu = hosting.gpuInfo.trim();
  const gpuCount = parseInt(hosting.gpuCount) || 0;
  const cpu = hosting.cpuModel.trim();
  const ramType = hosting.ramType.trim();

  if (gpu) {
    const prefix = gpuCount > 1 ? `${gpuCount}× ` : "";
    return `${prefix}${gpu}`;
  }
  if (cpu) {
    return ramType ? `${cpu} · ${ramType}` : cpu;
  }
  return ramType || "Hardware not specified";
}

/**
 * Human-readable model name. Known catalog entries come with a curated
 * `displayName`; for custom models we fall back to the user-provided `name`,
 * and finally to a generic placeholder so the header never renders empty.
 */
function getModelDisplayName(card: CardData): string {
  if (card.model.modelKey !== "custom") {
    const known = KNOWN_MODELS[card.model.modelKey];
    if (known) return known.displayName;
  }
  return card.model.customModel.name ?? "Custom model";
}

function ModelHeading({ card }: { card: CardData }) {
  const name = getModelDisplayName(card);
  const { quant, kvQuant, contextK } = card.model;

  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <h2
        className="text-base font-semibold truncate text-foreground"
        title={name}
      >
        {name}
      </h2>
      <div className="text-[11px] text-muted-foreground tabular-nums shrink-0">
        {quant} · KV {kvQuant} · {contextK}K
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md bg-secondary/60 px-2 py-2 text-center min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 leading-none">
        <span
          className={`text-2xl font-bold tabular-nums ${accent ? "text-primary" : "text-foreground"}`}
        >
          {value}
        </span>
        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
          {unit}
        </span>
      </div>
    </div>
  );
}

/**
 * Empty-state card shown when the iframe is opened without a `?s=` parameter.
 * Lives here (rather than in `main.tsx`) so HMR/Fast-Refresh stays happy —
 * `main.tsx` is an entry-point with side effects and may not export
 * components.
 */
export function EmbedFallback() {
  return (
    <div className="w-full max-w-md mx-auto rounded-xl border border-dashed border-border bg-card text-card-foreground p-4 text-sm text-muted-foreground">
      No configuration provided. Append <code>?s=…</code> to this URL to render
      a WeightRoom widget.
    </div>
  );
}

/**
 * Read-only single-card view used by the iframe widget. No interactivity:
 * everything is computed once from the decoded `CardData`. The footer links
 * back to the canonical calculator with the same configuration restored, so
 * readers can click through and tweak the numbers themselves.
 */
export function EmbedCard({ card }: EmbedCardProps) {
  const model = resolveModel(card);

  // No model resolved (stale URL referencing a removed catalog entry) — show
  // a friendly fallback rather than crashing the widget. The "Open" link is
  // still useful since the user might want to fix the config in the full app.
  if (!model) {
    return (
      <div className="w-full max-w-md mx-auto rounded-xl border border-border bg-card text-card-foreground p-4 text-sm text-muted-foreground">
        Unable to render this configuration. The model may have been renamed
        or removed.
      </div>
    );
  }

  const ram = calcLLMRam(getCalcOptions(card, model));
  const disk = calcDisk(model.params, card.model.quant);
  const score = calcValueScore(getValueScoreInput(card, model));
  const tps = score?.tps ?? null;

  const fullStateUrl = `${CANONICAL_BASE}?s=${encodeState({
    mode: "single",
    configs: [card],
  })}`;

  return (
    <article className="w-full max-w-md mx-auto rounded-xl border border-border bg-card text-card-foreground shadow-sm p-3 flex flex-col gap-2.5">
      <ModelHeading card={card} />

      <div className="text-[11px] text-muted-foreground truncate" title={describeHardware(card)}>
        {describeHardware(card)}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Metric label="RAM" value={ram.totalGb.toString()} unit="GB" />
        <Metric label="Storage" value={disk.totalGb.toString()} unit="GB" />
        <Metric
          label="TPS"
          value={tps !== null ? formatTps(tps) : "—"}
          unit={tps !== null ? "tok/s" : ""}
          accent
        />
      </div>

      <a
        href={fullStateUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-2 mt-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt=""
            className="w-3.5 h-3.5 rounded-sm"
          />
          Powered by <span className="font-semibold">WeightRoom</span>
        </span>
        <span className="flex items-center gap-1">
          Open in calculator
          <LuExternalLink className="w-3 h-3" aria-hidden="true" />
        </span>
      </a>

      {tps !== null && (
        <div className="text-[10px] text-muted-foreground/70 leading-snug">
          TPS is a theoretical roof-line maximum (bandwidth-bound). Real
          throughput is typically 60–90% on dense single-GPU.
        </div>
      )}
    </article>
  );
}
