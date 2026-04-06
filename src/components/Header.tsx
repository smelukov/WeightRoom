import { Button } from "@/components/ui/button";
import { LuCamera, LuLoader, LuShare2, LuTrash2 } from "react-icons/lu";
import { SiGithub } from "react-icons/si";
import { useState } from "react";

const REPO_URL = "https://github.com/smelukov/WeightRoom";

interface HeaderProps {
  mode: "single" | "compare";
  onModeChange: (mode: "single" | "compare") => void;
  canClear?: boolean | undefined;
  onClear?: (() => void) | undefined;
  // Returning a Promise is fine — handler is `await`-ed in the click handler
  // and we never inspect the result. Allowing both shapes keeps callers free
  // to pass either sync or async screenshot logic.
  onScreenshot?: (() => void | Promise<void>) | undefined;
  screenshotCapturing?: boolean | undefined;
}

export function Header({ mode, onModeChange, canClear, onClear, onScreenshot, screenshotCapturing }: HeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
        <button
          onClick={handleShare}
          title="Copy link to share"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <LuShare2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{copied ? "Copied!" : "Share"}</span>
        </button>
        {onScreenshot && (
          <button
            onClick={onScreenshot}
            disabled={screenshotCapturing}
            title="Save screenshot of all cards and charts"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
          >
            {screenshotCapturing
              ? <LuLoader className="w-3.5 h-3.5 shrink-0 animate-spin" aria-hidden="true" />
              : <LuCamera className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            <span className="hidden sm:inline">Screenshot</span>
          </button>
        )}
        {canClear && onClear && (
          <button
            onClick={onClear}
            title="Clear all configurations"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/50 transition-colors"
          >
            <LuTrash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Clear all</span>
          </button>
        )}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="View source on GitHub"
          aria-label="View source on GitHub"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <SiGithub className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}
