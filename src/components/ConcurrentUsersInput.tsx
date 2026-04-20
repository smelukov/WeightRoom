import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  ENGINE_PRESETS,
  CUSTOM_ENGINE_ID,
  resolveActiveEngine,
} from "@/lib/enginePresets";
import { InfoTooltip } from "./InfoTooltip";

interface ConcurrentUsersInputProps {
  concurrentUsers: number;
  kvCacheFillPct: number;
  /**
   * Identifier of the currently selected engine preset (e.g. "llamacpp",
   * "vllm", "tensorrt") or "custom" for a manually entered KV %.
   * `undefined` is treated as "legacy URL" — the component falls back to
   * matching by `kvCacheFillPct` value. See `ModelSettings.engineId`.
   */
  engineId?: string | undefined;
  onConcurrentUsersChange: (value: number) => void;
  onKvCacheFillPctChange: (value: number) => void;
  /**
   * Called whenever the user picks a different engine preset (or "custom").
   * For convenience the parent receives both the new id AND the matching pct
   * — that way callers can update both fields in a single state mutation.
   */
  onEngineChange: (engineId: string, kvCacheFillPct: number) => void;
}

const USER_PRESETS: readonly number[] = [1, 2, 4, 8, 16, 32, 64];

const CUSTOM = CUSTOM_ENGINE_ID;
const MIN_USERS = 1;
const MAX_USERS = 256;
const MIN_KV_PCT = 1;
const MAX_KV_PCT = 100;

const USERS_TOOLTIP =
  "Number of simultaneous inference requests. KV cache memory scales linearly with this value, and per-user TPS decreases as more users share bandwidth.";

const ENGINE_TOOLTIP = `Inference engine determines how aggressively KV cache is pre-allocated.

• Pre-allocation engines (llama.cpp, Ollama, MLX) reserve the full context window per slot at startup — worst-case memory but predictable.

• PagedAttention engines (vLLM, SGLang, TGI) allocate only what's actively used — typically ~25% for chatbot workloads.

Pick "Custom" if your engine is unusual or you want to model a specific load profile.`;

function findPresetById(id: string) {
  return ENGINE_PRESETS.find((p) => p.id === id) ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function ConcurrentUsersInput({
  concurrentUsers,
  kvCacheFillPct,
  engineId,
  onConcurrentUsersChange,
  onKvCacheFillPctChange,
  onEngineChange,
}: ConcurrentUsersInputProps) {
  // Users still uses a local "force custom" flag because the user-count is a
  // raw number (no stable id) — picking Custom… while the value is already 1
  // would otherwise silently no-op.
  const [usersForceCustom, setUsersForceCustom] = useState(false);

  const usersPresetActive =
    !usersForceCustom && USER_PRESETS.includes(concurrentUsers);

  const enginePreset = resolveActiveEngine(engineId, kvCacheFillPct);

  const handleUsersSelect = (value: string | null) => {
    if (value === null) return;
    if (value === CUSTOM) {
      setUsersForceCustom(true);
      return;
    }
    setUsersForceCustom(false);
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      onConcurrentUsersChange(parsed);
    }
  };

  const handleEngineSelect = (id: string | null) => {
    if (id === null) return;
    if (id === CUSTOM) {
      // Switching to custom keeps the current pct so the input pre-fills with
      // the previous preset's value — minimum surprise for the user.
      onEngineChange(CUSTOM, kvCacheFillPct);
      return;
    }
    const preset = findPresetById(id);
    if (preset) {
      onEngineChange(preset.id, preset.pct);
    }
  };

  const usersTriggerLabel = usersPresetActive
    ? `${concurrentUsers} ${concurrentUsers === 1 ? "user" : "users"}`
    : `Custom · ${concurrentUsers} ${concurrentUsers === 1 ? "user" : "users"}`;

  const engineTriggerLabel = enginePreset
    ? `${enginePreset.label} · ${enginePreset.pct}% KV`
    : `Custom · ${kvCacheFillPct}% KV`;

  // The Select's `value` must always match an actual <SelectItem value=…>.
  // For the engine dropdown this is `enginePreset.id` (preset case) or
  // CUSTOM. We can't echo back a raw kvCacheFillPct number — there's no
  // SelectItem for arbitrary pcts.
  const engineSelectValue = enginePreset ? enginePreset.id : CUSTOM;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* ── Users ─────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Label>Concurrent users</Label>
          <InfoTooltip content={USERS_TOOLTIP} />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={usersPresetActive ? String(concurrentUsers) : CUSTOM}
            onValueChange={handleUsersSelect}
          >
            <SelectTrigger
              data-testid="concurrent-users-trigger"
              className="h-8 text-sm flex-1 min-w-0"
            >
              <span className="truncate">{usersTriggerLabel}</span>
            </SelectTrigger>
            <SelectContent>
              {USER_PRESETS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} {n === 1 ? "user" : "users"}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM}>Custom…</SelectItem>
            </SelectContent>
          </Select>

          {!usersPresetActive && (
            <Input
              type="number"
              min={MIN_USERS}
              max={MAX_USERS}
              value={concurrentUsers}
              onChange={(e) => {
                const num = parseInt(e.target.value, 10);
                if (Number.isFinite(num)) {
                  onConcurrentUsersChange(clamp(num, MIN_USERS, MAX_USERS));
                }
              }}
              className="w-16 h-8 text-sm text-center shrink-0"
              aria-label="Custom concurrent users"
            />
          )}
        </div>
      </div>

      {/* ── Engine / KV fill ──────────────────────────────────────────── */}
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Label>Inference engine</Label>
          <InfoTooltip content={ENGINE_TOOLTIP} />
        </div>
        <div className="flex items-center gap-2">
          <Select value={engineSelectValue} onValueChange={handleEngineSelect}>
            <SelectTrigger
              data-testid="engine-trigger"
              className="h-8 text-sm flex-1 min-w-0"
            >
              <span className="truncate">{engineTriggerLabel}</span>
            </SelectTrigger>
            <SelectContent>
              {ENGINE_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  <div className="flex flex-col items-start gap-0.5 py-0.5">
                    <span className="text-sm">
                      {preset.label} · {preset.pct}% KV
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {preset.engines}
                    </span>
                  </div>
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM}>
                <div className="flex flex-col items-start gap-0.5 py-0.5">
                  <span className="text-sm">Custom KV %</span>
                  <span className="text-xs text-muted-foreground">
                    Set the value manually
                  </span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {!enginePreset && (
            <div className="flex items-center gap-1 shrink-0">
              <Input
                type="number"
                min={MIN_KV_PCT}
                max={MAX_KV_PCT}
                value={kvCacheFillPct}
                onChange={(e) => {
                  const num = parseInt(e.target.value, 10);
                  if (Number.isFinite(num)) {
                    onKvCacheFillPctChange(clamp(num, MIN_KV_PCT, MAX_KV_PCT));
                  }
                }}
                className="w-14 h-8 text-sm text-center"
                aria-label="Custom KV cache fill percent"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
