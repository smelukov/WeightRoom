import { toPng, toBlob, toSvg } from "html-to-image";
import { createRoot, type Root } from "react-dom/client";
import { ShareCard } from "@/share/ShareCard";
import type { CardData } from "@/lib/types";
import type { ShareFormat } from "@/share/formats";
import type { ShareTheme } from "@/share/ShareCard";

/** Common html-to-image options. Extracted so download/clipboard paths
 *  produce visually identical output. */
function captureOptions(element: HTMLElement) {
  const computed = getComputedStyle(element);
  return {
    backgroundColor: computed.backgroundColor || "#0f172a",
    pixelRatio: 2,
    cacheBust: true,
    style: {
      borderRadius: computed.borderRadius,
    },
  };
}

/**
 * Captures an HTML element as a PNG and triggers a file download.
 * Renders at 2× pixel ratio for crisp results on retina screens.
 */
export async function downloadScreenshot(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const dataUrl = await toPng(element, captureOptions(element));

  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/**
 * Captures an HTML element as a PNG and copies the resulting image to the
 * system clipboard via the async Clipboard API.
 *
 * Returns `true` if the clipboard write succeeded, `false` if the browser
 * refused (e.g. permission denied, unsupported MIME, no user gesture).
 *
 * Safari requires the `ClipboardItem` to be constructed *synchronously*
 * inside the user gesture callback. We satisfy that by passing the blob
 * promise directly to `ClipboardItem` rather than awaiting it first —
 * the spec explicitly supports promise-valued blobs for this reason.
 */
export async function copyScreenshotToClipboard(
  element: HTMLElement,
): Promise<boolean> {
  if (
    typeof ClipboardItem === "undefined" ||
    !navigator.clipboard?.write
  ) {
    return false;
  }

  try {
    const blobPromise = toBlob(element, captureOptions(element)).then(
      (blob) => {
        if (!blob) throw new Error("Screenshot capture returned no blob");
        return blob;
      },
    );

    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blobPromise }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds a safe filename slug from a model name + settings.
 */
export function buildCardFilename(
  modelName: string,
  quant: string,
  contextK: number,
): string {
  const slug = modelName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_.]/g, "");
  return `${slug}-${quant}-${contextK}k.png`;
}

/**
 * Builds a filename for a full comparison screenshot.
 */
export function buildCompareFilename(): string {
  const date = new Date();
  const ts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join("");
  return `weightroom-compare-${ts}.png`;
}

// ─── Share-card rendering (offscreen mount) ──────────────────────────────────

export interface ShareCardRenderOptions {
  /** Override QR visibility for this format. Defaults to format's preference. */
  includeQr?: boolean;
  /** Branding text override (used by the README "card-badge" format). */
  brandLabel?: string;
  /** Card colour theme. Defaults to "dark" — looks better in social feeds. */
  theme?: ShareTheme;
}

/** Wait for all webfonts to be ready before snapshotting, so html-to-image
 *  doesn't capture a fallback-font frame. `document.fonts.ready` resolves once
 *  every font referenced by the current document has loaded (or failed). */
async function waitForFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.ready) return;
  try {
    await document.fonts.ready;
  } catch {
    // Hostile environments (some print contexts) reject `fonts.ready` even
    // though fonts are usable. We swallow the rejection rather than blocking
    // the whole screenshot — worst case the capture uses a system fallback.
  }
}

/**
 * Wait for every `<img>` inside `container` to either finish loading or fail.
 * `decode()` is the modern, well-supported API; we fall back to a `complete`
 * check + load/error promise for older runtimes (Safari < 15.4).
 */
async function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map(async (img) => {
      if (img.complete && img.naturalWidth > 0) return;
      try {
        if (typeof img.decode === "function") {
          await img.decode();
          return;
        }
      } catch {
        // decode() rejects on broken images — fall through to settle below.
      }
      await new Promise<void>((resolve) => {
        const settle = () => resolve();
        img.addEventListener("load", settle, { once: true });
        img.addEventListener("error", settle, { once: true });
      });
    }),
  );
}

interface MountedCard {
  /** The actual `<ShareCard>` root element to pass into html-to-image. */
  target: HTMLElement;
  /** Tear-down — must be called in a `finally` to avoid leaking React roots. */
  cleanup: () => void;
}

/**
 * Mount a `<ShareCard>` instance off-screen and wait for it to be paint-ready.
 *
 * Why off-screen instead of inside the modal: html-to-image walks computed
 * styles, and any parent `transform: scale(...)` from a preview pane would
 * shrink the captured pixels too. Mounting in a dedicated, untransformed
 * container guarantees the canonical size is what gets captured.
 */
async function mountShareCard(
  card: CardData,
  format: ShareFormat,
  options: ShareCardRenderOptions,
): Promise<MountedCard> {
  const container = document.createElement("div");
  // `left/top` keep it visually off-screen; `pointer-events:none` prevents the
  // hidden node from stealing focus or hover; `width: max-content` lets the
  // wrapper size to its natural width (we don't want the body's flex layout
  // to squash the canvas).
  Object.assign(container.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    pointerEvents: "none",
    zIndex: "-1",
    width: "max-content",
  });
  document.body.appendChild(container);

  let root: Root | null = createRoot(container);
  root.render(
    <ShareCard
      card={card}
      format={format}
      includeQr={options.includeQr}
      brandLabel={options.brandLabel}
      theme={options.theme}
    />,
  );

  // Two RAF flushes: first to commit React's tree, second to let the browser
  // lay out and start fetching <img> resources. Without this, html-to-image
  // sometimes captures a frame where the layout has not stabilised.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  await Promise.all([waitForFonts(), waitForImages(container)]);

  const target = container.firstElementChild as HTMLElement | null;
  if (!target) {
    root.unmount();
    container.remove();
    throw new Error("ShareCard failed to mount: no DOM produced");
  }

  return {
    target,
    cleanup: () => {
      if (root) {
        root.unmount();
        root = null;
      }
      container.remove();
    },
  };
}

/** Capture options tuned for share-cards. Background defaults to transparent
 *  for the README card-badge (so it sits cleanly on any README colour); social
 *  formats already paint their own opaque background inside the card. The
 *  backgroundColor is only set when needed because html-to-image's `Options`
 *  type rejects `undefined` under exactOptionalPropertyTypes. */
function shareCardCaptureOptions(format: ShareFormat) {
  const base = {
    pixelRatio: 2,
    cacheBust: true,
    width: format.width,
    height: format.height,
  };
  return format.category === "social"
    ? base
    : { ...base, backgroundColor: "transparent" };
}

/**
 * Render a share-card to a PNG `Blob`. Use this when uploading or copying to
 * the clipboard via `ClipboardItem`. Resolves to `null` only if html-to-image
 * unexpectedly produced no blob — caller should treat that as a failure.
 */
export async function renderShareCardToBlob(
  card: CardData,
  format: ShareFormat,
  options: ShareCardRenderOptions = {},
): Promise<Blob | null> {
  const mounted = await mountShareCard(card, format, options);
  try {
    return await toBlob(mounted.target, shareCardCaptureOptions(format));
  } finally {
    mounted.cleanup();
  }
}

/**
 * Render a share-card to a PNG data URL. Use this for the in-modal preview
 * thumbnail or for inline `<img src>` injection.
 */
export async function renderShareCardToDataUrl(
  card: CardData,
  format: ShareFormat,
  options: ShareCardRenderOptions = {},
): Promise<string> {
  const mounted = await mountShareCard(card, format, options);
  try {
    return await toPng(mounted.target, shareCardCaptureOptions(format));
  } finally {
    mounted.cleanup();
  }
}

/**
 * Render a share-card to an SVG string. The card-badge format supports this
 * for crisp README rendering. NOTE: html-to-image's `toSvg` wraps HTML in a
 * `<foreignObject>` — some Markdown viewers (and a few RSS readers) won't
 * render that. Prefer the dedicated `shieldSvg` for shields.io-style badges,
 * which produces a true vector SVG.
 */
export async function renderShareCardToSvg(
  card: CardData,
  format: ShareFormat,
  options: ShareCardRenderOptions = {},
): Promise<string> {
  const mounted = await mountShareCard(card, format, options);
  try {
    return await toSvg(mounted.target, shareCardCaptureOptions(format));
  } finally {
    mounted.cleanup();
  }
}
