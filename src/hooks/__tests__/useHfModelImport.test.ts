import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useHfModelImport } from "../useHfModelImport";
import * as hfModule from "@/lib/hf";
import type { HfImportResult } from "@/lib/hf";
import type { ModelConfig } from "@/lib/types";

// We mock only fetchHfConfig — parseHfUrl is real, because URL parsing is a
// behavioural contract of the hook (it's how we know "invalid URL" path).
vi.mock("@/lib/hf", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/hf")>("@/lib/hf");
  return {
    ...actual,
    fetchHfConfig: vi.fn(),
  };
});

const fetchMock = hfModule.fetchHfConfig as MockedFunction<
  typeof hfModule.fetchHfConfig
>;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a deferred so a test can control exactly when fetchHfConfig resolves.
 * Indispensable for race-condition tests.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildModel(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    name: "TestModel",
    params: 7e9,
    layers: 32,
    kvHeads: 8,
    headDim: 128,
    moe: false,
    ...overrides,
  };
}

function buildResult(overrides: Partial<HfImportResult> = {}): HfImportResult {
  return {
    model: buildModel(),
    maxContextK: 32,
    modelId: "test/model",
    warning: null,
    capabilities: { vlm: false, thinking: false, toolUse: false },
    detectedPrecision: "bf16",
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("useHfModelImport — invalid URL", () => {
  it("sets a helpful error WITHOUT touching the network", async () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useHfModelImport({ onChange }),
    );
    await act(async () => {
      await result.current.doImport("not-a-url", 7e9);
    });
    expect(result.current.error).toMatch(/Invalid HuggingFace URL/i);
    expect(result.current.loading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("useHfModelImport — happy path", () => {
  it("calls onImport (preferred over onChange) with the trimmed URL and detected precision", async () => {
    // Two callbacks are wired up so we can verify the documented priority:
    // when onImport is provided, it wins and onChange must NOT fire.
    const onImport = vi.fn();
    const onChange = vi.fn();
    fetchMock.mockResolvedValue(
      buildResult({
        model: buildModel({ params: 9e9 }),
        maxContextK: 128,
        modelId: "google/gemma-2-9b",
        detectedPrecision: "bf16",
      }),
    );
    const { result } = renderHook(() =>
      useHfModelImport({ onImport, onChange }),
    );

    await act(async () => {
      // Surrounding whitespace matters: it MUST be trimmed before being
      // passed to onImport so URL state stays canonical.
      await result.current.doImport(
        "  https://huggingface.co/google/gemma-2-9b  ",
        7e9,
      );
    });

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    const [model, maxK, precision, importedFromUrl] = onImport.mock.calls[0]!;
    expect(model.params).toBe(9e9);
    expect(maxK).toBe(128);
    expect(precision).toBe("bf16");
    expect(importedFromUrl).toBe("https://huggingface.co/google/gemma-2-9b");

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.importedModelId).toBe("google/gemma-2-9b");
    expect(result.current.warning).toBeNull();
    expect(result.current.capabilities).toEqual({
      vlm: false,
      thinking: false,
      toolUse: false,
    });
  });

  it("falls back to onChange when onImport is not provided", async () => {
    const onChange = vi.fn();
    fetchMock.mockResolvedValue(buildResult());
    const { result } = renderHook(() => useHfModelImport({ onChange }));

    await act(async () => {
      await result.current.doImport(
        "https://huggingface.co/test/model",
        7e9,
      );
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].params).toBe(7e9);
  });

  it("uses currentParams as a fallback when config.json doesn't include params (params=0)", async () => {
    // fetchHfConfig is allowed to return params=0 when the model card
    // omits them (e.g. some quantized repos). The hook must substitute the
    // user's current value so the rest of the form keeps working.
    const onImport = vi.fn();
    fetchMock.mockResolvedValue(
      buildResult({ model: buildModel({ params: 0 }) }),
    );
    const { result } = renderHook(() =>
      useHfModelImport({ onImport, onChange: vi.fn() }),
    );

    await act(async () => {
      await result.current.doImport(
        "https://huggingface.co/test/model",
        13e9,
      );
    });

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0]![0].params).toBe(13e9);
  });
});

describe("useHfModelImport — error path", () => {
  it("captures fetch errors and never invokes onImport/onChange", async () => {
    const onImport = vi.fn();
    const onChange = vi.fn();
    fetchMock.mockRejectedValue(new Error("HF 404"));
    const { result } = renderHook(() =>
      useHfModelImport({ onImport, onChange }),
    );

    await act(async () => {
      await result.current.doImport(
        "https://huggingface.co/test/model",
        7e9,
      );
    });

    expect(result.current.error).toBe("HF 404");
    expect(result.current.loading).toBe(false);
    expect(onImport).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for non-Error rejections", async () => {
    // A bare string reject() comes through some legacy callers — make sure
    // we don't crash trying to read .message on it.
    fetchMock.mockRejectedValue("not an Error instance");
    const { result } = renderHook(() =>
      useHfModelImport({ onChange: vi.fn() }),
    );

    await act(async () => {
      await result.current.doImport(
        "https://huggingface.co/test/model",
        7e9,
      );
    });

    expect(result.current.error).toBe("Failed to fetch config");
  });

  it("clears stale error/warning/capabilities when a new import starts", async () => {
    // First call fails, second call succeeds → the success state must NOT
    // be polluted by leftovers from the failed attempt.
    fetchMock.mockRejectedValueOnce(new Error("first failed"));
    fetchMock.mockResolvedValueOnce(
      buildResult({
        warning: null,
        capabilities: { vlm: true, thinking: false, toolUse: true },
      }),
    );
    const { result } = renderHook(() =>
      useHfModelImport({ onChange: vi.fn() }),
    );

    await act(async () => {
      await result.current.doImport(
        "https://huggingface.co/test/model",
        7e9,
      );
    });
    expect(result.current.error).toBe("first failed");

    await act(async () => {
      await result.current.doImport(
        "https://huggingface.co/test/model2",
        7e9,
      );
    });
    expect(result.current.error).toBeNull();
    expect(result.current.capabilities?.vlm).toBe(true);
  });
});

describe("useHfModelImport — race conditions (the whole reason this hook exists)", () => {
  it("discards an old response that resolves AFTER a newer request was started", async () => {
    // This is the bug the requestIdRef guard is there to prevent: user
    // pastes URL A, then quickly URL B. If A's slow reply arrives last,
    // it would otherwise overwrite B's (correct) result.
    const onImport = vi.fn();
    const slow = deferred<HfImportResult>();
    const fast = deferred<HfImportResult>();
    fetchMock.mockReturnValueOnce(slow.promise).mockReturnValueOnce(
      fast.promise,
    );

    const { result } = renderHook(() =>
      useHfModelImport({ onImport, onChange: vi.fn() }),
    );

    let firstPromise!: Promise<void>;
    let secondPromise!: Promise<void>;
    act(() => {
      firstPromise = result.current.doImport(
        "https://huggingface.co/test/A",
        7e9,
      );
      secondPromise = result.current.doImport(
        "https://huggingface.co/test/B",
        7e9,
      );
    });

    await act(async () => {
      fast.resolve(buildResult({ modelId: "test/B" }));
      await secondPromise;
    });

    expect(result.current.importedModelId).toBe("test/B");
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0]![3]).toBe("https://huggingface.co/test/B");

    await act(async () => {
      slow.resolve(buildResult({ modelId: "test/A" }));
      await firstPromise;
    });

    // The stale A response must NOT have overwritten anything.
    expect(result.current.importedModelId).toBe("test/B");
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("keeps loading=true while the latest request is still in flight even if an older one rejects", async () => {
    // If a stale failure flipped loading=false, the spinner would
    // disappear under the user's feet while a newer request is still
    // pending — exactly the bug noted in the source code's comment.
    const slow = deferred<HfImportResult>();
    const fast = deferred<HfImportResult>();
    fetchMock.mockReturnValueOnce(slow.promise).mockReturnValueOnce(
      fast.promise,
    );

    const { result } = renderHook(() =>
      useHfModelImport({ onChange: vi.fn() }),
    );

    let firstPromise!: Promise<void>;
    act(() => {
      firstPromise = result.current.doImport(
        "https://huggingface.co/test/A",
        7e9,
      );
      void result.current.doImport("https://huggingface.co/test/B", 7e9);
    });

    expect(result.current.loading).toBe(true);

    // Fail the OLD request — loading must stay true (newer one in flight).
    await act(async () => {
      slow.reject(new Error("slow failed"));
      await firstPromise;
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();

    // Now resolve the newer one — only now can loading drop to false.
    await act(async () => {
      fast.resolve(buildResult({ modelId: "test/B" }));
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.importedModelId).toBe("test/B");
  });
});

describe("useHfModelImport — unmount safety", () => {
  it("does not invoke onImport (or update state) after the component is unmounted", async () => {
    // mountedRef is the second guard: even when there's no newer request,
    // if the component is gone we must not call back into a parent that
    // may itself be unmounted, and we must not setState on a torn-down
    // hook.
    const onImport = vi.fn();
    const inflight = deferred<HfImportResult>();
    fetchMock.mockReturnValue(inflight.promise);

    const { result, unmount } = renderHook(() =>
      useHfModelImport({ onImport, onChange: vi.fn() }),
    );

    let importPromise!: Promise<void>;
    act(() => {
      importPromise = result.current.doImport(
        "https://huggingface.co/test/model",
        7e9,
      );
    });

    unmount();

    // Resolve AFTER unmount — onImport must not be called.
    await act(async () => {
      inflight.resolve(buildResult());
      await importPromise;
    });

    expect(onImport).not.toHaveBeenCalled();
  });

  it("REGRESSION (StrictMode): mountedRef is restored to true on remount so post-mount imports still work", async () => {
    // React 18 StrictMode simulates an unmount/remount of every effect in
    // dev. Without `mountedRef.current = true` in the effect setup, every
    // request after the simulated remount would be silently discarded.
    // This test models that lifecycle: we don't have StrictMode wired up
    // here, but we do simulate it directly by calling the cleanup ourselves
    // through unmount/rerender — which is conceptually what StrictMode
    // does. The guarantee we want is: even if the cleanup runs, a fresh
    // mount can still complete imports.
    const onImport = vi.fn();
    fetchMock.mockResolvedValue(buildResult({ modelId: "google/gemma-2-9b" }));

    // First, mount and immediately unmount to fire the cleanup that
    // flips mountedRef to false.
    const { unmount: u1 } = renderHook(() =>
      useHfModelImport({ onImport, onChange: vi.fn() }),
    );
    u1();

    // Now mount a fresh instance — this is the "remount" scenario.
    const { result: r2 } = renderHook(() =>
      useHfModelImport({ onImport, onChange: vi.fn() }),
    );
    await act(async () => {
      await r2.current.doImport(
        "https://huggingface.co/google/gemma-2-9b",
        9e9,
      );
    });

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(r2.current.importedModelId).toBe("google/gemma-2-9b");
  });
});

describe("useHfModelImport — loading lifecycle", () => {
  it("flips loading true → false around a single in-flight request", async () => {
    const inflight = deferred<HfImportResult>();
    fetchMock.mockReturnValue(inflight.promise);
    const { result } = renderHook(() =>
      useHfModelImport({ onChange: vi.fn() }),
    );

    let importPromise!: Promise<void>;
    act(() => {
      importPromise = result.current.doImport(
        "https://huggingface.co/test/model",
        7e9,
      );
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      inflight.resolve(buildResult());
      await importPromise;
    });

    expect(result.current.loading).toBe(false);
  });
});
