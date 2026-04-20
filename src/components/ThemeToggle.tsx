import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { LuSun, LuMoon, LuMonitor } from "react-icons/lu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ThemeChoice = "light" | "dark" | "system";

const CHOICES: ReadonlyArray<{
  id: ThemeChoice;
  label: string;
  Icon: typeof LuSun;
}> = [
  { id: "light", label: "Light", Icon: LuSun },
  { id: "dark", label: "Dark", Icon: LuMoon },
  { id: "system", label: "System", Icon: LuMonitor },
];

/**
 * Three-state theme switcher (Light / Dark / System) shown in the header.
 *
 * The trigger icon reflects the *resolved* theme (what the user is actually
 * looking at), so on a Mac with System=dark you'll see a moon — even when the
 * stored choice is "system". The dropdown items always show all three options
 * with a checkmark on the explicit user choice.
 *
 * SSR/static-export note: `next-themes` cannot know the user's preference
 * during SSG/first render, so the resolved theme is `undefined` until the
 * effect runs. We render a placeholder icon (LuMonitor) until mounted to
 * avoid a hydration mismatch and a flickering icon. The anti-flash script
 * in index.html still handles the actual page colors.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Mount-flag is the documented next-themes pattern for avoiding a flicker
    // between the SSR/initial render (where `resolvedTheme` is undefined) and
    // the first client paint. We genuinely need the side-effecting setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const ResolvedIcon = !mounted
    ? LuMonitor
    : resolvedTheme === "dark"
      ? LuMoon
      : LuSun;

  // Pretty-print the active choice for the tooltip.
  // `theme` is the user's stored choice ("system"/"light"/"dark"); we
  // surface that rather than `resolvedTheme` so the tooltip explicitly
  // tells the user "you chose System (currently dark)" — useful feedback
  // since the trigger icon already shows the resolved state.
  const activeLabel = !mounted
    ? "Toggle theme"
    : theme === "system"
      ? `System (currently ${resolvedTheme ?? "…"})`
      : `Theme: ${theme}`;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              aria-label="Toggle theme"
              className="flex items-center justify-center w-8 h-8 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              <ResolvedIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </DropdownMenuTrigger>
          }
        />
        <TooltipContent>{activeLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-[8rem]">
        {CHOICES.map(({ id, label, Icon }) => (
          <DropdownMenuItem
            key={id}
            onClick={() => setTheme(id)}
            data-active={theme === id || undefined}
            data-testid={`theme-option-${id}`}
            className="gap-2"
          >
            <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {mounted && theme === id && (
              <span className="text-primary text-xs" aria-hidden="true">
                ●
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
