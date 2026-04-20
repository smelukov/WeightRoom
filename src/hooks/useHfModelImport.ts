import { useState, useCallback, useRef, useEffect } from "react";
import { parseHfUrl, fetchHfConfig } from "@/lib/hf";
import type { ModelCapabilities } from "@/lib/hf";
import type { ModelConfig, QuantName } from "@/lib/types";

interface UseHfModelImportOptions {
  /** Called when import succeeds and a parent component needs to update its full state. */
  onImport?:
    | ((
        model: ModelConfig,
        maxK: number,
        detectedPrecision: QuantName | null,
        importedFromUrl: string,
      ) => void)
    | undefined;
  /** Called when import succeeds and there is no onImport handler (custom-only update). */
  onChange: (model: ModelConfig) => void;
}

export interface HfImportState {
  loading: boolean;
  error: string | null;
  /** HuggingFace model repo ID of the last successfully imported model. */
  importedModelId: string | null;
  warning: string | null;
  capabilities: ModelCapabilities | null;
}

export interface UseHfModelImportResult extends HfImportState {
  /**
   * Fetch and apply model config from a HuggingFace URL.
   * @param url   Raw URL pasted by the user.
   * @param currentParams  Current model param count used as fallback when params are missing in config.json.
   */
  doImport: (url: string, currentParams: number) => Promise<void>;
}

/**
 * Manages the HuggingFace model import flow: URL validation, API fetch,
 * and loading/error/warning state.
 *
 * Isolated from JSX so that CustomModelForm can focus purely on layout.
 *
 * Race-condition handling: each `doImport` call is assigned a monotonic id.
 * When multiple imports are in flight (e.g. user pastes URL A, then URL B
 * before A resolves), only the latest response is allowed to write state —
 * earlier responses are silently discarded. Without this guard a slow reply
 * for URL A could overwrite the correct result for URL B.
 */
export function useHfModelImport({
  onImport,
  onChange,
}: UseHfModelImportOptions): UseHfModelImportResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedModelId, setImportedModelId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<ModelCapabilities | null>(null);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  // We re-set `mountedRef.current = true` on every mount because React 18
  // StrictMode simulates an unmount/remount in development: the cleanup
  // below fires once, flipping the ref to `false`, and without restoring it
  // here every subsequent in-flight request would be silently discarded
  // (every `doImport` would short-circuit with `mounted: false`).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const doImport = useCallback(
    async (url: string, currentParams: number) => {
      const trimmed = url.trim();
      const repoId = parseHfUrl(trimmed);
      if (!repoId) {
        setError("Invalid HuggingFace URL. Expected: huggingface.co/org/model");
        return;
      }
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      setImportedModelId(null);
      setWarning(null);
      setCapabilities(null);
      try {
        const result = await fetchHfConfig(repoId);
        if (requestId !== requestIdRef.current || !mountedRef.current) {
          // A newer import has started (or the component unmounted).
          // Discard this stale response entirely.
          return;
        }
        const model = {
          ...result.model,
          params: result.model.params || currentParams,
        };
        if (onImport) {
          onImport(model, result.maxContextK, result.detectedPrecision, trimmed);
        } else {
          onChange(model);
        }
        setImportedModelId(result.modelId);
        setWarning(result.warning);
        setCapabilities(result.capabilities);
      } catch (e) {
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        setError(e instanceof Error ? e.message : "Failed to fetch config");
      } finally {
        // Only the latest request clears the loading indicator — otherwise a
        // stale failure would turn the spinner off while a newer request is
        // still running.
        if (requestId === requestIdRef.current && mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [onImport, onChange],
  );

  return { loading, error, importedModelId, warning, capabilities, doImport };
}
