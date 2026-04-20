import { toPng, toBlob } from "html-to-image";

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
