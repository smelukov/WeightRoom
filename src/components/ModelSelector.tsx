import React, { useMemo, useState, type ClipboardEvent } from "react";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "./InfoTooltip";
import { BrandIcon } from "./BrandIcon";
import { LuExternalLink } from "react-icons/lu";
import { CapabilityBadges } from "./CapabilityBadges";
import {
  getModelGroups,
  findModelOption,
  KNOWN_MODELS,
  type ModelOption,
  type ModelGroup,
} from "@/lib/models";

/**
 * Word-based search: every word in the query must be found somewhere
 * in the target string (case-insensitive).
 *
 * Examples:
 *   "qwen 27"  → matches "Qwen 3.5 27B"  (both "qwen" and "27" found)
 *   "3 27"     → matches "Qwen 3.5 27B"  (both "3" and "27" found)
 *   "llama 70" → matches "Llama 3.3 70B"
 */
function matchesWords(query: string, target: string): boolean {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const lower = target.toLowerCase();
  return words.every((w) => lower.includes(w));
}

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  /** Вызывается когда в поле поиска вставляется HuggingFace URL. */
  onHfUrl?: (url: string) => void;
}

const HF_URL_RE = /(?:https?:\/\/)?huggingface\.co\/([^/\s?#]+\/[^/\s?#]+)/i;

function extractHfUrl(text: string): string | null {
  const match = HF_URL_RE.exec(text.trim());
  return match ? `https://huggingface.co/${match[1]}` : null;
}

const MODEL_GROUPS: ModelGroup[] = getModelGroups();

export function ModelSelector({ value, onChange, onHfUrl }: ModelSelectorProps) {
  const selected = useMemo(() => findModelOption(value), [value]);
  const hfRepoId =
    value !== "custom" ? (KNOWN_MODELS[value]?.hfRepoId ?? null) : null;
  const [open, setOpen] = useState(false);

  const handleHfUrl = (url: string) => {
    setOpen(false);
    onHfUrl?.(url);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Label>Model</Label>
        <InfoTooltip content="Select a known model with pre-filled architecture parameters, or choose 'Custom' to enter them manually. Parameters come from each model's HuggingFace config.json." />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-0">
        <Combobox
          items={MODEL_GROUPS}
          value={selected}
          onValueChange={(option: ModelOption | null) => {
            if (option) onChange(option.key);
          }}
          itemToStringValue={(opt: ModelOption) => opt.displayName}
          open={open}
          onOpenChange={setOpen}
          filter={(item: ModelOption, query: string, itemToString?: (item: ModelOption) => string) => {
            const label = itemToString?.(item) ?? item.displayName;
            return matchesWords(query, label);
          }}
        >
          <ComboboxTrigger
            render={
              <Button
                variant="outline"
                className="w-full min-w-0 justify-between font-normal"
              />
            }
          >
            <span className="flex items-center gap-1.5 truncate min-w-0">
              {selected?.brand && (
                <BrandIcon brand={selected.brand} size={14} />
              )}
              <span className="truncate">
                {selected?.displayName ?? "Select model..."}
              </span>
              <CapabilityBadges caps={selected?.capabilities} />
            </span>
          </ComboboxTrigger>
          <ComboboxContent>
            <ComboboxInput
              showTrigger={false}
              placeholder="Search or paste HF link..."
              onPaste={
                onHfUrl
                  ? (e: ClipboardEvent<HTMLInputElement>) => {
                      const text = e.clipboardData.getData("text");
                      const url = extractHfUrl(text);
                      if (url) {
                        e.preventDefault();
                        handleHfUrl(url);
                      }
                    }
                  : undefined
              }
              onKeyDown={
                onHfUrl
                  ? (e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key !== "Enter") return;
                      const url = extractHfUrl(
                        (e.target as HTMLInputElement).value,
                      );
                      if (url) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleHfUrl(url);
                      }
                    }
                  : undefined
              }
            />
            <ComboboxEmpty>No models found.</ComboboxEmpty>
            <ComboboxList>
              {(group: ModelGroup, index: number) => (
                <ComboboxGroup key={group.value} items={group.items}>
                  <ComboboxLabel>{group.value}</ComboboxLabel>
                  <ComboboxCollection>
                    {(model: ModelOption) => (
                      <ComboboxItem key={model.key} value={model}>
                        <span className="flex items-center gap-2">
                          {model.brand && (
                            <BrandIcon brand={model.brand} size={14} />
                          )}
                          <span className="flex-1">{model.displayName}</span>
                          <CapabilityBadges caps={model.capabilities} />
                        </span>
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                  {index < MODEL_GROUPS.length - 1 && <ComboboxSeparator />}
                </ComboboxGroup>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        </div>
        {hfRepoId && (
          <a
            href={`https://huggingface.co/${hfRepoId}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${hfRepoId} on HuggingFace`}
            className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg border border-input text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <LuExternalLink className="size-4" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}
