import { useEffect, useMemo, useRef, useState } from "react";
import {
  LuCheck,
  LuClipboard,
  LuDownload,
  LuLink,
  LuImage,
  LuBadgeCheck,
  LuCode,
} from "react-icons/lu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  renderShareCardToBlob,
  renderShareCardToDataUrl,
  renderShareCardToSvg,
} from "@/lib/screenshot";
import { encodeState, encodeStateForEmbed } from "@/lib/state";
import { getShareBaseUrl } from "@/lib/url";
import type { CardData } from "@/lib/types";
import {
  SHARE_FORMATS,
  getShareFormatsByCategory,
  type ShareFormat,
  type ShareFormatId,
  type ShareFileFormat,
} from "./formats";
import { ShareCard, type ShareTheme } from "./ShareCard";
import { renderShieldSvg, shieldSvgToDataUrl } from "./shieldSvg";

export type ShareTab = "link" | "image" | "badge" | "embed";

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "single" | "compare";
  configs: CardData[];
  /** Optional: open the modal directly on a given tab. Defaults to "link". */
  initialTab?: ShareTab;
}

const TABS: { id: ShareTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "link", label: "Link", icon: LuLink },
  { id: "image", label: "Image", icon: LuImage },
  { id: "badge", label: "Badge", icon: LuBadgeCheck },
  { id: "embed", label: "Embed", icon: LuCode },
];

// ─── Reusable bits ───────────────────────────────────────────────────────────

function CopyButton({
  onCopy,
  label = "Copy",
  copiedLabel = "Copied!",
}: {
  onCopy: () => Promise<void> | void;
  label?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await onCopy();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Caller is responsible for surfacing errors via UI if needed.
      // We intentionally swallow here so a failed clipboard write doesn't
      // throw an unhandled rejection at the React boundary.
    }
  };
  return (
    <Button type="button" size="sm" onClick={handle}>
      {copied ? (
        <>
          <LuCheck className="w-3.5 h-3.5" /> {copiedLabel}
        </>
      ) : (
        <>
          <LuClipboard className="w-3.5 h-3.5" /> {label}
        </>
      )}
    </Button>
  );
}

function CardPicker({
  configs,
  value,
  onChange,
}: {
  configs: CardData[];
  value: number;
  onChange: (idx: number) => void;
}) {
  if (configs.length <= 1) return null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="share-card-picker">Card</Label>
      <select
        id="share-card-picker"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
      >
        {configs.map((c, i) => {
          const label = c.model.modelKey === "custom"
            ? c.model.customModel.name ?? `Card ${i + 1}`
            : c.model.modelKey;
          return (
            <option key={c.id} value={i}>
              #{i + 1} · {label} · {c.model.quant}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex flex-wrap gap-1 rounded-lg bg-secondary p-1">
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.id)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Tab: Link ───────────────────────────────────────────────────────────────

function LinkTab({ mode, configs }: { mode: "single" | "compare"; configs: CardData[] }) {
  const url = useMemo(() => {
    const encoded = encodeState({ mode, configs });
    return `${getShareBaseUrl()}?s=${encoded}`;
  }, [mode, configs]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Shareable URL with all current settings encoded. Anyone who opens it
        sees the same configuration you do — no account, no login.
      </p>
      <div className="flex gap-2">
        <Input readOnly value={url} className="font-mono text-xs" />
        <CopyButton onCopy={() => navigator.clipboard.writeText(url)} />
      </div>
    </div>
  );
}

// ─── Tab: Image (social formats) ─────────────────────────────────────────────

const SOCIAL_FORMATS = getShareFormatsByCategory("social");

function ImageTab({ configs }: { configs: CardData[] }) {
  const [cardIdx, setCardIdx] = useState(0);
  const [formatId, setFormatId] = useState<ShareFormatId>(SOCIAL_FORMATS[0]?.id ?? "og");
  // Theme lives at this level (not inside ImageTabBody) so it survives the
  // format switch — users typically pick Light/Dark once and then iterate
  // through OG / Square / Story without losing that choice.
  const [theme, setTheme] = useState<ShareTheme>("dark");
  const format = SOCIAL_FORMATS.find((f) => f.id === formatId) ?? SOCIAL_FORMATS[0];
  const card = configs[cardIdx] ?? configs[0];
  if (!card || !format) return null;
  // ImageTabBody is keyed by format.id so React unmounts and re-mounts it on
  // format change, giving the inner `useState(format.defaultIncludeQr)` a
  // fresh initial value without the antipattern of "setState inside effect".
  return (
    <ImageTabBody
      key={format.id}
      configs={configs}
      cardIdx={cardIdx}
      onCardIdxChange={setCardIdx}
      format={format}
      formatId={formatId}
      onFormatChange={setFormatId}
      card={card}
      theme={theme}
      onThemeChange={setTheme}
    />
  );
}

function ImageTabBody({
  configs,
  cardIdx,
  onCardIdxChange,
  format,
  formatId,
  onFormatChange,
  card,
  theme,
  onThemeChange,
}: {
  configs: CardData[];
  cardIdx: number;
  onCardIdxChange: (idx: number) => void;
  format: ShareFormat;
  formatId: ShareFormatId;
  onFormatChange: (id: ShareFormatId) => void;
  card: CardData;
  theme: ShareTheme;
  onThemeChange: (t: ShareTheme) => void;
}) {
  const [includeQr, setIncludeQr] = useState(format.defaultIncludeQr);

  const handleDownload = async () => {
    const dataUrl = await renderShareCardToDataUrl(card, format, { includeQr, theme });
    const link = document.createElement("a");
    link.download = `weightroom-${format.id}-${theme}.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleCopy = async () => {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      throw new Error("Clipboard API unavailable");
    }
    const blobPromise = renderShareCardToBlob(card, format, { includeQr, theme }).then(
      (b) => {
        if (!b) throw new Error("Capture returned no blob");
        return b;
      },
    );
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
  };

  return (
    <div className="space-y-4">
      <CardPicker configs={configs} value={cardIdx} onChange={onCardIdxChange} />

      <div className="space-y-2">
        <Label>Format</Label>
        <SegmentedControl
          ariaLabel="Image format"
          options={SOCIAL_FORMATS.map((f) => ({ id: f.id, label: f.label }))}
          value={formatId}
          onChange={onFormatChange}
        />
        <p className="text-xs text-muted-foreground">{format.description}</p>
      </div>

      <div className="space-y-2">
        <Label>Theme</Label>
        <SegmentedControl
          ariaLabel="Image theme"
          options={[
            { id: "dark", label: "Dark" },
            { id: "light", label: "Light" },
          ]}
          value={theme}
          onChange={onThemeChange}
        />
        <p className="text-xs text-muted-foreground">
          PNG is a raster image and can't auto-adapt to the host. Pick Dark
          for X/LinkedIn (looks bold in feed) or Light for slide decks and
          docs with white backgrounds.
        </p>
      </div>

      {format.qrToggleVisible && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeQr}
            onChange={(e) => setIncludeQr(e.target.checked)}
            className="rounded border-input"
          />
          <span>Include QR code linking back to this configuration</span>
        </label>
      )}

      <PreviewBox card={card} format={format} includeQr={includeQr} theme={theme} />

      <div className="flex flex-wrap gap-2 justify-end">
        <CopyButton onCopy={handleCopy} label="Copy PNG" copiedLabel="Copied!" />
        <Button type="button" size="sm" variant="default" onClick={handleDownload}>
          <LuDownload className="w-3.5 h-3.5" /> Download PNG
        </Button>
      </div>
    </div>
  );
}

// ─── Tab: Badge (README) ─────────────────────────────────────────────────────

const BADGE_STYLES = [
  { id: "shield" as const, label: "Shield (narrow)" },
  { id: "card-badge" as const, label: "Card (mini-card)" },
] as const;
type BadgeStyleId = (typeof BADGE_STYLES)[number]["id"];

function BadgeTab({ configs }: { configs: CardData[] }) {
  const [cardIdx, setCardIdx] = useState(0);
  const [style, setStyle] = useState<BadgeStyleId>("shield");
  const format = SHARE_FORMATS.find((f) => f.id === style) ?? SHARE_FORMATS[0];
  const card = configs[cardIdx] ?? configs[0];
  if (!card || !format) return null;
  // Keyed by `style` so the body's local `useState(format.fileFormats[0])`
  // re-initialises naturally when the user flips Shield ↔ Card.
  return (
    <BadgeTabBody
      key={style}
      configs={configs}
      cardIdx={cardIdx}
      onCardIdxChange={setCardIdx}
      style={style}
      onStyleChange={setStyle}
      format={format}
      card={card}
    />
  );
}

function BadgeTabBody({
  configs,
  cardIdx,
  onCardIdxChange,
  style,
  onStyleChange,
  format,
  card,
}: {
  configs: CardData[];
  cardIdx: number;
  onCardIdxChange: (idx: number) => void;
  style: BadgeStyleId;
  onStyleChange: (s: BadgeStyleId) => void;
  format: ShareFormat;
  card: CardData;
}) {
  const [fileFormat, setFileFormat] = useState<ShareFileFormat>(
    format.fileFormats[0] ?? "svg",
  );
  const [labelOverride, setLabelOverride] = useState("WeightRoom");
  // Two independent theme states: shield supports "auto" (CSS currentColor),
  // while card-style is a baked PNG/SVG layout that can't adapt — only
  // Light/Dark make sense there. Keeping them separate avoids a confusing
  // "Universal disappears when you switch to Card" moment.
  const [shieldTheme, setShieldTheme] = useState<"auto" | "light" | "dark">("auto");
  const [cardTheme, setCardTheme] = useState<ShareTheme>("dark");

  const isShield = style === "shield";

  const shieldSvgString = useMemo(
    () =>
      isShield
        ? renderShieldSvg(card, { label: labelOverride, theme: shieldTheme })
        : "",
    [isShield, card, labelOverride, shieldTheme],
  );

  const handleDownloadShield = () => {
    const blob = new Blob([shieldSvgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "weightroom-badge.svg";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCard = async () => {
    const filename = `weightroom-card-badge-${cardTheme}.${fileFormat}`;
    if (fileFormat === "svg") {
      const svg = await renderShareCardToSvg(card, format, {
        brandLabel: labelOverride,
        theme: cardTheme,
      });
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = filename;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      const dataUrl = await renderShareCardToDataUrl(card, format, {
        brandLabel: labelOverride,
        theme: cardTheme,
      });
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
    }
  };

  const markdownSnippet = isShield
    ? `[![${labelOverride}](${shieldSvgToDataUrl(shieldSvgString)})](${getShareBaseUrl()}?s=${encodeState({ mode: "single", configs: [card] })})`
    : `![WeightRoom](./assets/weightroom-card-badge.${fileFormat})`;

  return (
    <div className="space-y-4">
      <CardPicker configs={configs} value={cardIdx} onChange={onCardIdxChange} />

      <div className="space-y-2">
        <Label>Style</Label>
        <SegmentedControl
          ariaLabel="Badge style"
          options={BADGE_STYLES}
          value={style}
          onChange={onStyleChange}
        />
      </div>

      <div className="space-y-2">
        <Label>File format</Label>
        <SegmentedControl
          ariaLabel="File format"
          options={(format.fileFormats as readonly ShareFileFormat[]).map((f) => ({
            id: f,
            label: f.toUpperCase(),
          }))}
          value={fileFormat}
          onChange={setFileFormat}
        />
        {isShield && (
          <p className="text-xs text-muted-foreground">
            PNG would blur the text — shield-style badges are vector-only.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="badge-label">Label</Label>
        <Input
          id="badge-label"
          value={labelOverride}
          onChange={(e) => setLabelOverride(e.target.value)}
          placeholder="WeightRoom"
        />
      </div>

      {isShield ? (
        <div className="space-y-2">
          <Label>Theme</Label>
          <SegmentedControl
            ariaLabel="Theme"
            options={[
              // "Universal" is shown in the UI for clarity — internally
              // we still pass "auto" to keep the shield API stable.
              { id: "auto", label: "Universal" },
              { id: "light", label: "Light" },
              { id: "dark", label: "Dark" },
            ]}
            value={shieldTheme}
            onChange={setShieldTheme}
          />
          <p className="text-xs text-muted-foreground">
            <strong>Universal</strong> uses CSS <code>currentColor</code> so
            the badge value text follows the host README's light/dark theme
            on GitHub. <strong>Light</strong> and <strong>Dark</strong> use
            fixed colours — pick them when you control the host theme and
            want predictable rendering on forums or PDFs.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Theme</Label>
          <SegmentedControl
            ariaLabel="Card theme"
            options={[
              { id: "dark", label: "Dark" },
              { id: "light", label: "Light" },
            ]}
            value={cardTheme}
            onChange={setCardTheme}
          />
          <p className="text-xs text-muted-foreground">
            Card badges are baked at export time — they can't repaint to match
            the host. Pick the variant that suits your README's background.
          </p>
        </div>
      )}

      {isShield ? (
        <div
          className="flex items-center justify-center rounded-lg border border-border bg-card p-4"
          dangerouslySetInnerHTML={{ __html: shieldSvgString }}
        />
      ) : (
        <PreviewBox
          card={card}
          format={format}
          theme={cardTheme}
          brandLabel={labelOverride}
        />
      )}

      <div className="space-y-1.5">
        <Label htmlFor="badge-md">Markdown</Label>
        <textarea
          id="badge-md"
          readOnly
          value={markdownSnippet}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono min-h-[64px]"
        />
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        <CopyButton
          onCopy={() => navigator.clipboard.writeText(markdownSnippet)}
          label="Copy markdown"
        />
        {isShield && (
          <CopyButton
            onCopy={() => navigator.clipboard.writeText(shieldSvgString)}
            label="Copy SVG source"
          />
        )}
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={isShield ? handleDownloadShield : handleDownloadCard}
        >
          <LuDownload className="w-3.5 h-3.5" /> Download
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground/80 leading-snug">
        Badges are a static snapshot of the current calculation. If
        WeightRoom's formulas update later, this badge in your README will
        keep showing today's numbers (no live recalculation).
      </p>
    </div>
  );
}

// ─── Tab: Embed (iframe) ─────────────────────────────────────────────────────

function EmbedTab({ configs }: { configs: CardData[] }) {
  const [cardIdx, setCardIdx] = useState(0);
  const [theme, setTheme] = useState<"auto" | "light" | "dark">("auto");
  const card = configs[cardIdx] ?? configs[0];
  if (!card) return null;

  const encoded = encodeStateForEmbed(card);
  const embedUrl = `${getShareBaseUrl()}embed.html?s=${encoded}&theme=${theme}`;
  const iframeSnippet = `<iframe
  src="${embedUrl}"
  width="100%" height="220" frameborder="0"
  loading="lazy" title="WeightRoom widget"
></iframe>`;

  return (
    <div className="space-y-4">
      <CardPicker configs={configs} value={cardIdx} onChange={setCardIdx} />

      <div className="space-y-2">
        <Label>Theme</Label>
        <SegmentedControl
          ariaLabel="Embed theme"
          options={[
            { id: "auto", label: "Auto (match parent)" },
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
          ]}
          value={theme}
          onChange={setTheme}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Snippet</Label>
        <textarea
          readOnly
          value={iframeSnippet}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono min-h-[110px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Live preview</Label>
        <div className="rounded-lg border border-border bg-secondary/30 overflow-hidden">
          <iframe
            src={embedUrl}
            title="WeightRoom embed preview"
            className="w-full h-[220px] border-0 bg-transparent"
            loading="lazy"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <CopyButton
          onCopy={() => navigator.clipboard.writeText(iframeSnippet)}
          label="Copy snippet"
        />
      </div>
    </div>
  );
}

// ─── Preview helper ──────────────────────────────────────────────────────────

const PREVIEW_MAX_WIDTH = 480;
/**
 * Soft height cap for the preview so vertically-tall formats (notably Story
 * 1080×1920, ratio ≈0.56) don't push the dialog past the viewport. We pick
 * 520px as a compromise: ≈55% of a 13" laptop's vertical room, leaves space
 * for the controls above and the Download buttons below without the user
 * having to scroll the modal body to interact with anything.
 */
const PREVIEW_MAX_HEIGHT = 520;

/**
 * Live preview of a `<ShareCard>`. The card is rendered at its canonical size
 * and visually scaled down with CSS `transform: scale(...)` so it fits the
 * modal — no re-layout, no font-size drift, identical to what the captured
 * PNG/SVG produces.
 */
function PreviewBox({
  card,
  format,
  includeQr,
  theme,
  brandLabel,
}: {
  card: CardData;
  format: ShareFormat;
  includeQr?: boolean;
  theme: ShareTheme;
  brandLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      const w = containerRef.current?.clientWidth ?? PREVIEW_MAX_WIDTH;
      // Pick the smallest scale across width and height so the preview fits
      // comfortably in both dimensions. Without the height clamp, Story
      // (1080×1920) would render at ~960×1707px in a 1024-wide modal — taller
      // than most laptop viewports.
      const scaleByWidth = w / format.width;
      const scaleByHeight = PREVIEW_MAX_HEIGHT / format.height;
      setScale(Math.min(1, scaleByWidth, scaleByHeight));
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [format.width, format.height]);

  return (
    <div
      ref={containerRef}
      className="rounded-lg border border-border bg-secondary/30 p-2 overflow-hidden flex justify-center"
    >
      <div
        style={{
          width: format.width * scale,
          height: format.height * scale,
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: format.width,
            height: format.height,
          }}
        >
          <ShareCard
            card={card}
            format={format}
            includeQr={includeQr}
            brandLabel={brandLabel}
            theme={theme}
          />
        </div>
      </div>
    </div>
  );
}

// ─── ShareModal entry ────────────────────────────────────────────────────────

/**
 * Top-level share dialog. Holds the active tab in local state and renders the
 * matching panel. We deliberately don't lift tab state into props — the modal
 * reopens on the same tab as last time only if the host explicitly passes
 * `initialTab`, which keeps the API simple for the common case.
 */
export function ShareModal({
  open,
  onOpenChange,
  mode,
  configs,
  initialTab,
}: ShareModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Width strategy:
        - Mobile (<sm): w-[calc(100vw-1rem)] so the dialog occupies almost the
          full viewport with a small breathing margin. Important because the
          preview area for image/badge tabs would otherwise blow past the
          screen edge on phones.
        - sm (≥640): cap at max-w-3xl (768px) — comfortable for the Link tab
          and short controls.
        - lg (≥1024): widen to max-w-5xl (1024px) so the social-card preview
          (1200×630, story 1080×1920) gets enough horizontal room to scale
          legibly without hitting the height ceiling immediately.

        Layout strategy:
        - p-0 + flex column lets us paint our own internal padding and have
          the header/tabs stay sticky while only the body scrolls. Without
          this, the entire dialog scrolls and the user loses the tab bar
          behind the viewport edge on long Story-format previews.
      */}
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-3xl lg:max-w-5xl p-0 gap-0 overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
        <ShareModalBody
          // Re-mount the body on every open so the active tab and inner
          // controls reset cleanly to the caller's `initialTab`. Cheaper
          // than threading a `useEffect`-driven reset through every panel.
          key={open ? "open" : "closed"}
          mode={mode}
          configs={configs}
          initialTab={initialTab ?? "link"}
        />
      </DialogContent>
    </Dialog>
  );
}

function ShareModalBody({
  mode,
  configs,
  initialTab,
}: {
  mode: "single" | "compare";
  configs: CardData[];
  initialTab: ShareTab;
}) {
  const [tab, setTab] = useState<ShareTab>(initialTab);

  return (
    <>
      {/*
        Sticky header: title + description + tab bar all stay pinned to the
        top of the dialog while the panel below scrolls. Background is opaque
        (bg-background) so the scrolled content doesn't bleed through, and we
        carry the bottom border of the tab bar inside this sticky block so
        the visual seam stays at the same coordinate.
      */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-6 pt-6 pb-0 flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Share this configuration</DialogTitle>
          <DialogDescription>
            Copy a link, download a social card, generate a README badge, or
            embed the calculator on your page.
          </DialogDescription>
        </DialogHeader>

        <div role="tablist" aria-label="Share format" className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((t) => {
            const active = t.id === tab;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`share-panel-${t.id}`}
                id={`share-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`share-panel-${tab}`}
        aria-labelledby={`share-tab-${tab}`}
        className="flex-1 overflow-y-auto px-6 py-4"
      >
        {tab === "link" && <LinkTab mode={mode} configs={configs} />}
        {tab === "image" && <ImageTab configs={configs} />}
        {tab === "badge" && <BadgeTab configs={configs} />}
        {tab === "embed" && <EmbedTab configs={configs} />}
      </div>
    </>
  );
}
