import { toPng } from "html-to-image";

/**
 * Captures an HTML element as a PNG and triggers a file download.
 * Renders at 2× pixel ratio for crisp results on retina screens.
 */
export async function downloadScreenshot(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const bgColor = getComputedStyle(element).backgroundColor;

  const dataUrl = await toPng(element, {
    backgroundColor: bgColor || "#0f172a",
    pixelRatio: 2,
    cacheBust: true,
    style: {
      // ensure rounding is preserved in screenshot
      borderRadius: getComputedStyle(element).borderRadius,
    },
  });

  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
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
