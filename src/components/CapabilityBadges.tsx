import { LuBrain, LuEye, LuWrench } from "react-icons/lu";
import type { ModelCapabilities } from "@/lib/types";

interface BadgeDefinition {
  key: keyof ModelCapabilities;
  title: string;
  compactColor: string;
  pillColor: string;
  icon: React.ReactNode;
  label: string;
}

const BADGE_DEFS: BadgeDefinition[] = [
  {
    key: "vlm",
    title: "Vision (multimodal)",
    compactColor: "text-violet-400",
    pillColor: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    icon: <LuEye className="w-3 h-3" aria-hidden="true" />,
    label: "Vision",
  },
  {
    key: "thinking",
    title: "Extended thinking / reasoning",
    compactColor: "text-blue-400",
    pillColor: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    icon: <LuBrain className="w-3 h-3" aria-hidden="true" />,
    label: "Thinking",
  },
  {
    key: "toolUse",
    title: "Tool / function calling",
    compactColor: "text-amber-400",
    pillColor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    icon: <LuWrench className="w-3 h-3" aria-hidden="true" />,
    label: "Tools",
  },
];

interface CapabilityBadgesProps {
  /**
   * Capability flags for the model. `null` and `undefined` are both treated as
   * "no badges to show" — we accept both so callers can pass either an explicit
   * `null` (e.g. for an unknown model) or just omit the prop entirely.
   */
  caps?: ModelCapabilities | null | undefined;
  /**
   * When true, renders pill badges with text labels (used after HF import).
   * When false (default), renders compact icon-only badges (used in model selector).
   */
  showLabels?: boolean;
}

/**
 * Displays capability indicators for a model (vision, thinking, tool use).
 * Use `showLabels={false}` (default) for the compact selector list,
 * and `showLabels={true}` for the post-import details view.
 */
export function CapabilityBadges({ caps, showLabels = false }: CapabilityBadgesProps) {
  if (!caps) return null;

  const active = BADGE_DEFS.filter((b) => caps[b.key]);
  if (active.length === 0) return null;

  if (!showLabels) {
    return (
      <span className="flex items-center gap-0.5 shrink-0">
        {active.map((b) => (
          <span key={b.key} title={b.title} className={b.compactColor}>
            {b.icon}
          </span>
        ))}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {active.map((b) => (
        <span
          key={b.key}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${b.pillColor}`}
        >
          {b.icon}
          {b.label}
        </span>
      ))}
    </div>
  );
}
