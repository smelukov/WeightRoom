import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface InfoTooltipProps {
  content: string;
}

/**
 * Small "?" badge that reveals an explanatory tooltip on hover, focus, or click.
 *
 * Thin wrapper around the base-ui Tooltip primitive — we get focus management,
 * Esc-to-close, portal rendering, automatic positioning and ARIA wiring for
 * free instead of re-implementing all of that ourselves.
 *
 * The `content` string is also used as `aria-label` so screen readers announce
 * the actual hint text instead of "question mark button" 30 times per page.
 */
export function InfoTooltip({ content }: InfoTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        // The `?` glyph is purely visual — without aria-label every InfoTooltip
        // would announce as "question mark button" to screen readers.
        aria-label={content}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex shrink-0 items-center justify-center w-4 h-4 rounded-full bg-muted text-muted-foreground text-[10px] font-medium hover:bg-muted-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none transition-colors cursor-help"
      >
        ?
      </TooltipTrigger>
      <TooltipContent className="max-w-64 whitespace-pre-line text-left">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
