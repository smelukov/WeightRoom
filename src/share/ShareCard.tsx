import type { CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import { calcLLMRam, calcDisk, calcValueScore } from "@/lib/calculator";
import {
  resolveModel,
  getCalcOptions,
  getValueScoreInput,
} from "@/lib/calcInput";
import { encodeState } from "@/lib/state";
import { KNOWN_MODELS } from "@/lib/models";
import type { CardData } from "@/lib/types";
import type { ShareFormat } from "./formats";

const CANONICAL_BASE = "https://smelukov.github.io/WeightRoom/";
const LOGO_URL = `${CANONICAL_BASE}logo.svg`;

export type ShareTheme = "light" | "dark";

interface ShareCardProps {
  card: CardData;
  format: ShareFormat;
  /** Show a QR code for the canonical URL. Ignored on formats without QR. */
  includeQr?: boolean | undefined;
  /**
   * Label override for the card-badge format (top brand line). Defaults to
   * "WeightRoom". Useful when teams want to label the badge with their stack
   * name or project, while still linking to WeightRoom for the math.
   */
  brandLabel?: string | undefined;
  /**
   * Theme for the card chrome. Defaults to "dark" because dark cards photograph
   * better in social feeds and stand out against the white background of a
   * Twitter / LinkedIn timeline.
   */
  theme?: ShareTheme | undefined;
}

interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  qrBg: string;
  qrFg: string;
}

const PALETTES: Record<ShareTheme, Palette> = {
  dark: {
    // Sampled from the app's dark `--background` / `--card` tokens (oklch
    // values resolved to sRGB hex so the captured PNG looks identical to the
    // running app instead of drifting because of colour-space conversion).
    bg: "#0a0a0a",
    surface: "#161616",
    surfaceAlt: "#1f1f1f",
    border: "#2a2a2a",
    text: "#fafafa",
    textMuted: "#a3a3a3",
    accent: "#a78bfa",
    qrBg: "#fafafa",
    qrFg: "#0a0a0a",
  },
  light: {
    bg: "#ffffff",
    surface: "#ffffff",
    surfaceAlt: "#f5f5f5",
    border: "#e5e5e5",
    text: "#0a0a0a",
    textMuted: "#737373",
    accent: "#7c3aed",
    qrBg: "#ffffff",
    qrFg: "#0a0a0a",
  },
};

function getModelDisplayName(card: CardData): string {
  if (card.model.modelKey !== "custom") {
    const known = KNOWN_MODELS[card.model.modelKey];
    if (known) return known.displayName;
  }
  return card.model.customModel.name ?? "Custom model";
}

function describeHardware(card: CardData): string {
  const { hosting } = card;
  const gpu = hosting.gpuInfo.trim();
  const gpuCount = parseInt(hosting.gpuCount) || 0;
  const cpu = hosting.cpuModel.trim();
  const ramType = hosting.ramType.trim();
  if (gpu) {
    const prefix = gpuCount > 1 ? `${gpuCount}× ` : "";
    return `${prefix}${gpu}${ramType ? ` · ${ramType}` : ""}`;
  }
  if (cpu) return ramType ? `${cpu} · ${ramType}` : cpu;
  return ramType || "Hardware not specified";
}

function formatTps(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  }
  if (value >= 100) return Math.round(value).toString();
  return value.toFixed(1);
}

interface DerivedMetrics {
  modelName: string;
  hardware: string;
  ramTotal: number;
  diskTotal: number;
  tps: number | null;
  shareUrl: string;
}

function derive(card: CardData): DerivedMetrics {
  const model = resolveModel(card);
  const shareUrl = `${CANONICAL_BASE}?s=${encodeState({
    mode: "single",
    configs: [card],
  })}`;
  if (!model) {
    return {
      modelName: getModelDisplayName(card),
      hardware: describeHardware(card),
      ramTotal: 0,
      diskTotal: 0,
      tps: null,
      shareUrl,
    };
  }
  const ram = calcLLMRam(getCalcOptions(card, model));
  const disk = calcDisk(model.params, card.model.quant);
  const score = calcValueScore(getValueScoreInput(card, model));
  return {
    modelName: getModelDisplayName(card),
    hardware: describeHardware(card),
    ramTotal: ram.totalGb,
    diskTotal: disk.totalGb,
    tps: score?.tps ?? null,
    shareUrl,
  };
}

// ─── Shared building blocks ──────────────────────────────────────────────────

const FONT_STACK =
  "'Geist Variable', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function MetricBlock({
  label,
  value,
  unit,
  palette,
  size,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  palette: Palette;
  size: "lg" | "xl";
  accent?: boolean;
}) {
  const numberSize = size === "xl" ? 84 : 60;
  const labelSize = size === "xl" ? 18 : 14;
  return (
    <div
      style={{
        background: palette.surfaceAlt,
        borderRadius: 16,
        padding: size === "xl" ? "24px 28px" : "16px 20px",
        textAlign: "center",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: labelSize,
          color: palette.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          color: accent ? palette.accent : palette.text,
          fontSize: numberSize,
          fontWeight: 700,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
        <span
          style={{
            marginLeft: 8,
            fontSize: numberSize * 0.32,
            fontWeight: 400,
            color: palette.textMuted,
          }}
        >
          {unit}
        </span>
      </div>
    </div>
  );
}

function BrandRow({
  palette,
  fontSize,
  withTagline,
  brandLabel,
}: {
  palette: Palette;
  fontSize: number;
  withTagline?: boolean | undefined;
  brandLabel?: string | undefined;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: palette.text,
      }}
    >
      <img
        src={LOGO_URL}
        alt=""
        crossOrigin="anonymous"
        style={{ width: fontSize * 1.4, height: fontSize * 1.4, borderRadius: 6 }}
      />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize, fontWeight: 700, letterSpacing: "-0.01em" }}>
          {brandLabel ?? "WeightRoom"}
        </span>
        {withTagline && (
          <span style={{ fontSize: fontSize * 0.45, color: palette.textMuted }}>
            LLM hardware calculator
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Format-specific layouts ─────────────────────────────────────────────────

function SocialLayout({
  card,
  format,
  includeQr,
  palette,
}: {
  card: CardData;
  format: ShareFormat;
  includeQr: boolean;
  palette: Palette;
}) {
  const { modelName, hardware, ramTotal, diskTotal, tps, shareUrl } =
    derive(card);
  const isStory = format.id === "story";
  const isOg = format.id === "og";

  // Padding scales with the smaller dimension so vertical Story format keeps
  // breathing room instead of pinning content to the top edge.
  const pad = Math.round(Math.min(format.width, format.height) * 0.06);

  const qrSize = isStory ? 220 : isOg ? 140 : 180;

  const tpsValue = tps !== null ? formatTps(tps) : "—";
  const tpsUnit = tps !== null ? "tok/s" : "";

  return (
    <div
      style={{
        width: format.width,
        height: format.height,
        background: palette.bg,
        color: palette.text,
        fontFamily: FONT_STACK,
        padding: pad,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: pad * 0.75,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <BrandRow
          palette={palette}
          fontSize={isStory ? 36 : isOg ? 28 : 32}
          withTagline
        />
        {includeQr && (
          <div
            style={{
              background: palette.qrBg,
              padding: 12,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <QRCodeSVG
              value={shareUrl}
              size={qrSize}
              bgColor={palette.qrBg}
              fgColor={palette.qrFg}
              level="M"
            />
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flex: isStory ? "0 0 auto" : 0,
        }}
      >
        <div
          style={{
            fontSize: isStory ? 88 : isOg ? 72 : 80,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
            color: palette.text,
          }}
        >
          {modelName}
        </div>
        <div
          style={{
            fontSize: isStory ? 32 : isOg ? 24 : 28,
            color: palette.textMuted,
          }}
        >
          {card.model.quant} · KV {card.model.kvQuant} · {card.model.contextK}K
          context
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: pad * 0.5,
          alignItems: "stretch",
        }}
      >
        <MetricBlock
          label="RAM"
          value={ramTotal.toString()}
          unit="GB"
          palette={palette}
          size={isStory ? "xl" : "lg"}
        />
        <MetricBlock
          label="Storage"
          value={diskTotal.toString()}
          unit="GB"
          palette={palette}
          size={isStory ? "xl" : "lg"}
        />
        <MetricBlock
          label="TPS"
          value={tpsValue}
          unit={tpsUnit}
          palette={palette}
          size={isStory ? "xl" : "lg"}
          accent
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          fontSize: isStory ? 24 : isOg ? 18 : 22,
          color: palette.textMuted,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {hardware}
        </span>
        <span style={{ flexShrink: 0 }}>smelukov.github.io/WeightRoom</span>
      </div>
    </div>
  );
}

function CardBadgeLayout({
  card,
  format,
  palette,
  brandLabel,
}: {
  card: CardData;
  format: ShareFormat;
  palette: Palette;
  brandLabel?: string | undefined;
}) {
  const { modelName, ramTotal, tps } = derive(card);
  const tpsLabel = tps !== null ? `${formatTps(tps)} tok/s` : "—";
  const subtitle = `${card.model.quant} · ${card.model.contextK}K`;

  return (
    <div
      style={{
        width: format.width,
        height: format.height,
        background: palette.surface,
        color: palette.text,
        fontFamily: FONT_STACK,
        border: `1px solid ${palette.border}`,
        borderRadius: 14,
        boxSizing: "border-box",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: 18,
      }}
    >
      <img
        src={LOGO_URL}
        alt=""
        crossOrigin="anonymous"
        style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0 }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: palette.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {brandLabel ?? "WeightRoom"}
          </span>
          <span style={{ fontSize: 11, color: palette.textMuted }}>
            {subtitle}
          </span>
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: palette.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={modelName}
        >
          {modelName}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: 14,
          flexShrink: 0,
          alignItems: "center",
        }}
      >
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: palette.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            RAM
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {ramTotal}
            <span style={{ fontSize: 12, color: palette.textMuted, marginLeft: 3 }}>
              GB
            </span>
          </div>
        </div>
        <div style={{ width: 1, height: 36, background: palette.border }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: palette.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            TPS
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: palette.accent,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {tpsLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Offscreen-mounted DOM template captured by html-to-image to produce PNG/SVG
 * share-cards. Uses inline styles (no Tailwind) so the captured output never
 * depends on which CSS files happen to be loaded on the host page.
 *
 * Shield-style badges are NOT rendered here — they go through the dedicated
 * `shieldSvg` string generator for crisp vector output.
 */
export function ShareCard({
  card,
  format,
  includeQr,
  brandLabel,
  theme = "dark",
}: ShareCardProps) {
  const palette = PALETTES[theme];
  const wrapperStyle: CSSProperties = {
    display: "inline-block",
    background: format.category === "social" ? palette.bg : "transparent",
  };
  const showQr = includeQr ?? format.defaultIncludeQr;

  return (
    <div style={wrapperStyle} data-share-card={format.id}>
      {format.id === "card-badge" ? (
        <CardBadgeLayout
          card={card}
          format={format}
          palette={palette}
          brandLabel={brandLabel}
        />
      ) : (
        <SocialLayout
          card={card}
          format={format}
          includeQr={showQr && format.qrToggleVisible}
          palette={palette}
        />
      )}
    </div>
  );
}
