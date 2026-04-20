/**
 * URL helpers shared across the app, share modal, and embed widget.
 *
 * These live in `src/lib/` so the embed bundle can import them without
 * pulling in any UI dependency.
 */

/**
 * Last-resort base URL used only when the app is rendered without a real
 * browser origin (SSR snapshot, `file://` preview opened straight from disk).
 *
 * Every other case — localhost, GitHub Pages, HF Space, any custom-domain
 * fork — derives the base from `window.location` so the generated artefacts
 * always point at the host the user is actually looking at.
 */
export const CANONICAL_BASE = "https://smelukov.github.io/WeightRoom/";

/**
 * Returns the base URL for share artefacts (iframe `src`, badge link target,
 * "Open in calculator" link inside the embed widget, screenshot footers,
 * etc.).
 *
 * We always prefer the current page's origin + directory so:
 *   - localhost dev produces `http://localhost:5173/...` (handy for testing
 *     a snippet in another local tab before publishing);
 *   - GitHub Pages produces `https://<user>.github.io/<repo>/...`;
 *   - HF Space produces `https://<user>-<space>.static.hf.space/...`;
 *   - any fork on a custom domain produces snippets pointing at itself;
 *   - inside the embed iframe, `window.location` points at the host that
 *     served `embed.html`, so the "Open in calculator" link lands the user
 *     on the same deployment they were already browsing.
 *
 * The returned value always ends with `/` so callers can safely append
 * `embed.html?...` or `?s=...`. `file://` and SSR fall back to
 * {@link CANONICAL_BASE} because they have no meaningful shareable origin.
 */
export function getShareBaseUrl(): string {
  if (typeof window === "undefined") return CANONICAL_BASE;
  const { protocol, origin, pathname } = window.location;
  if (protocol === "file:") return CANONICAL_BASE;
  // Strip the filename (if any) from pathname so we keep just the dir, then
  // ensure exactly one trailing slash. Examples:
  //   "/"                → "/"
  //   "/WeightRoom/"     → "/WeightRoom/"
  //   "/calc/index.html" → "/calc/"
  const dir = pathname.replace(/[^/]*$/, "");
  return `${origin}${dir.endsWith("/") ? dir : `${dir}/`}`;
}
