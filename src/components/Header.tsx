import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LuCamera,
  LuCheck,
  LuClipboard,
  LuDownload,
  LuLoader,
  LuShare2,
  LuTrash2,
} from "react-icons/lu";
import { SiGithub } from "react-icons/si";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { ShareModal } from "@/share/ShareModal";
import type { CardData } from "@/lib/types";

const REPO_URL = "https://github.com/smelukov/WeightRoom";

/** Shared style for square icon-only header buttons. Centralised so all
 *  utility actions in the toolbar (Share, Screenshot, Clear, GitHub, theme)
 *  share the same hit-area, padding, hover treatment, and ARIA shape. */
const ICON_BUTTON_CLASS =
  "flex items-center justify-center w-8 h-8 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50";

interface HeaderProps {
  mode: "single" | "compare";
  onModeChange: (mode: "single" | "compare") => void;
  canClear?: boolean | undefined;
  onClear?: (() => void) | undefined;
  /** Action chosen from the screenshot dropdown. May return a promise so
   *  callers can keep their busy-state in sync; the result is not inspected. */
  onScreenshot?:
    | ((action: "save" | "copy") => void | Promise<void>)
    | undefined;
  screenshotCapturing?: boolean | undefined;
  /** Current card configurations — passed through to the Share modal so it
   *  can build link/image/badge/embed artefacts without re-reading the URL. */
  configs: CardData[];
}

export function Header({
  mode,
  onModeChange,
  canClear,
  onClear,
  onScreenshot,
  screenshotCapturing,
  configs,
}: HeaderProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [screenshotResult, setScreenshotResult] = useState<
    "saved" | "copied" | null
  >(null);

  const handleScreenshotAction = async (action: "save" | "copy") => {
    if (!onScreenshot) return;
    await onScreenshot(action);
    setScreenshotResult(action === "save" ? "saved" : "copied");
    setTimeout(() => setScreenshotResult(null), 2000);
  };

  return (
    <header className="text-center py-8 px-4">
      <h1 className="flex items-center justify-center gap-2.5 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
        <img
          src={`${import.meta.env.BASE_URL}logo.svg`}
          alt=""
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-md"
        />
        WeightRoom
      </h1>
      <p className="text-muted-foreground mt-2 text-sm sm:text-base">
        Estimate hardware requirements for local or cloud LLM deployment
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <div className="inline-flex rounded-lg bg-secondary p-1 gap-1">
          <Button
            variant={mode === "single" ? "default" : "ghost"}
            size="sm"
            onClick={() => onModeChange("single")}
          >
            Single
          </Button>
          <Button
            variant={mode === "compare" ? "default" : "ghost"}
            size="sm"
            onClick={() => onModeChange("compare")}
          >
            Compare
          </Button>
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                aria-label="Share configuration"
                className={ICON_BUTTON_CLASS}
              >
                <LuShare2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </button>
            }
          />
          <TooltipContent>Share…</TooltipContent>
        </Tooltip>

        <ShareModal
          open={shareOpen}
          onOpenChange={setShareOpen}
          mode={mode}
          configs={configs}
        />

        {onScreenshot && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    aria-label={
                      screenshotResult === "saved"
                        ? "Saved!"
                        : screenshotResult === "copied"
                          ? "Copied!"
                          : "Save or copy screenshot"
                    }
                    disabled={screenshotCapturing}
                    className={ICON_BUTTON_CLASS}
                  >
                    {screenshotCapturing ? (
                      <LuLoader
                        className="w-3.5 h-3.5 shrink-0 animate-spin"
                        aria-hidden="true"
                      />
                    ) : screenshotResult ? (
                      <LuCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <LuCamera className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    )}
                  </DropdownMenuTrigger>
                }
              />
              <TooltipContent>
                {screenshotResult === "saved"
                  ? "Saved!"
                  : screenshotResult === "copied"
                    ? "Copied to clipboard"
                    : "Screenshot"}
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" sideOffset={6} className="min-w-[10rem]">
              <DropdownMenuItem
                onClick={() => handleScreenshotAction("save")}
                className="gap-2"
              >
                <LuDownload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Save as PNG</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleScreenshotAction("copy")}
                className="gap-2"
              >
                <LuClipboard className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Copy to clipboard</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {canClear && onClear && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onClear}
                  aria-label="Clear all configurations"
                  className={`${ICON_BUTTON_CLASS} hover:text-destructive hover:border-destructive/50`}
                >
                  <LuTrash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                </button>
              }
            />
            <TooltipContent>Clear all</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger
            render={
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View source on GitHub"
                className={ICON_BUTTON_CLASS}
              >
                <SiGithub className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </a>
            }
          />
          <TooltipContent>View source on GitHub</TooltipContent>
        </Tooltip>

        <ThemeToggle />
      </div>
    </header>
  );
}
