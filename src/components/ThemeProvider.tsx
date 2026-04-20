import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Single theming entry-point for the whole app.
 *
 * Wraps `next-themes` with project defaults so call sites don't need to
 * remember the right options:
 *   - `attribute="class"` — toggles `class="light"` / `class="dark"` on <html>
 *     to match the existing `@custom-variant dark (&:is(.dark *))` rule
 *     defined in src/index.css.
 *   - `defaultTheme="system"` — first-time visitors follow their OS preference.
 *   - `enableSystem` — keeps "System" as a valid stored value.
 *   - `disableTransitionOnChange` — prevents the half-second colour fade across
 *     every element when the user flips the theme (it looks like a glitch).
 *
 * The provider also synchronises the choice with `localStorage["theme"]`,
 * which the inline anti-flash script in index.html reads BEFORE first paint.
 */
export function ThemeProvider(
  props: ComponentProps<typeof NextThemesProvider>,
) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="theme"
      {...props}
    />
  );
}
