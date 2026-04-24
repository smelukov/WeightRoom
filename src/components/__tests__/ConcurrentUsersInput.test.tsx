import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConcurrentUsersInput } from "../ConcurrentUsersInput";
import {
  resolveActiveEngine,
  pickCompatibleEngine,
  ENGINE_PRESETS,
  CUSTOM_ENGINE_ID,
} from "@/lib/enginePresets";
import { QUANT_FAMILY_ENGINES, getQuantFamily } from "@/lib/quants";
import type { QuantName } from "@/lib/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

interface RenderOpts {
  concurrentUsers?: number;
  kvCacheFillPct?: number;
  engineId?: string | undefined;
  /**
   * Default "fp16" — float family is compatible with EVERY engine preset,
   * so existing tests written before quant filtering keep their semantics.
   * Tests that exercise filtering should pass an explicit quant.
   */
  quant?: QuantName;
  onConcurrentUsersChange?: (v: number) => void;
  onKvCacheFillPctChange?: (v: number) => void;
  onEngineChange?: (id: string, pct: number) => void;
}

function renderInput(overrides: RenderOpts = {}) {
  const onConcurrentUsersChange = overrides.onConcurrentUsersChange ?? vi.fn();
  const onKvCacheFillPctChange = overrides.onKvCacheFillPctChange ?? vi.fn();
  const onEngineChange = overrides.onEngineChange ?? vi.fn();
  const utils = render(
    <ConcurrentUsersInput
      concurrentUsers={overrides.concurrentUsers ?? 1}
      kvCacheFillPct={overrides.kvCacheFillPct ?? 100}
      engineId={overrides.engineId}
      quant={overrides.quant ?? "fp16"}
      onConcurrentUsersChange={onConcurrentUsersChange}
      onKvCacheFillPctChange={onKvCacheFillPctChange}
      onEngineChange={onEngineChange}
    />,
  );
  return {
    ...utils,
    onConcurrentUsersChange,
    onKvCacheFillPctChange,
    onEngineChange,
  };
}

const usersTrigger = () => screen.getByTestId("concurrent-users-trigger");
const engineTrigger = () => screen.getByTestId("engine-trigger");
const usersCustomInput = () =>
  screen.queryByLabelText("Custom concurrent users") as HTMLInputElement | null;
const engineCustomInput = () =>
  screen.queryByLabelText(
    "Custom KV cache fill percent",
  ) as HTMLInputElement | null;

// ─── Pure logic: resolveActiveEngine ───────────────────────────────────────
//
// This function is the single source of truth for "which engine is shown".
// Tested in isolation because every UI behaviour below derives from it.

describe("resolveActiveEngine", () => {
  it("returns null when engineId is the literal 'custom'", () => {
    // Even when pct happens to match a preset value (100), explicit "custom"
    // wins: that's the whole reason engineId exists separately from pct.
    expect(resolveActiveEngine(CUSTOM_ENGINE_ID, 100)).toBeNull();
    expect(resolveActiveEngine(CUSTOM_ENGINE_ID, 25)).toBeNull();
  });

  it("returns the preset when engineId matches AND pct agrees", () => {
    expect(resolveActiveEngine("llamacpp", 100)?.id).toBe("llamacpp");
    expect(resolveActiveEngine("vllm", 25)?.id).toBe("vllm");
    expect(resolveActiveEngine("tensorrt", 30)?.id).toBe("tensorrt");
  });

  it("returns null when engineId matches a preset but pct DISAGREES (de-sync)", () => {
    // Hand-crafted URL with engineId=vllm + pct=99 should not silently render
    // as "PagedAttention · 25% KV" — we'd be lying about the value used in
    // the calculation. Falling back to Custom forces the truth.
    expect(resolveActiveEngine("vllm", 99)).toBeNull();
    expect(resolveActiveEngine("llamacpp", 50)).toBeNull();
  });

  it("returns null for unknown engine ids", () => {
    expect(resolveActiveEngine("not-a-real-engine", 100)).toBeNull();
  });

  it("falls back to pct-based matching when engineId is undefined (legacy URLs)", () => {
    // URLs created before engineId existed must keep working.
    expect(resolveActiveEngine(undefined, 100)?.id).toBe("llamacpp");
    expect(resolveActiveEngine(undefined, 25)?.id).toBe("vllm");
    expect(resolveActiveEngine(undefined, 30)?.id).toBe("tensorrt");
    expect(resolveActiveEngine(undefined, 60)).toBeNull();
  });
});

// ─── Pure logic: pickCompatibleEngine (auto-snap source of truth) ─────────
//
// Auto-snap behaviour in ConfigCard reduces to this single function. By
// testing it in isolation we cover every (quant family, current engine)
// permutation without spinning up a full DOM render of ConfigCard.

describe("pickCompatibleEngine", () => {
  function setFor(quant: QuantName) {
    return QUANT_FAMILY_ENGINES[getQuantFamily(quant)];
  }

  it("returns null when current engine is already compatible (no snap needed)", () => {
    // GGUF on llama.cpp — already valid, must not be touched.
    expect(pickCompatibleEngine(setFor("q4_k_m"), "llamacpp")).toBeNull();
    // AWQ on vLLM — already valid.
    expect(pickCompatibleEngine(setFor("awq_4bit"), "vllm")).toBeNull();
    // GPTQ on TensorRT-LLM — already valid.
    expect(pickCompatibleEngine(setFor("gptq_4bit"), "tensorrt")).toBeNull();
    // "custom" is universally compatible.
    expect(pickCompatibleEngine(setFor("awq_4bit"), CUSTOM_ENGINE_ID)).toBeNull();
  });

  it("snaps GGUF→AWQ to the first GPU preset (vLLM, 25% KV)", () => {
    expect(pickCompatibleEngine(setFor("awq_4bit"), "llamacpp")).toEqual({
      engineId: "vllm",
      kvCacheFillPct: 25,
    });
  });

  it("snaps GGUF→GPTQ to the first GPU preset (vLLM, 25% KV)", () => {
    expect(pickCompatibleEngine(setFor("gptq_4bit"), "llamacpp")).toEqual({
      engineId: "vllm",
      kvCacheFillPct: 25,
    });
  });

  it("snaps AWQ→GGUF back to llama.cpp (100% KV)", () => {
    expect(pickCompatibleEngine(setFor("q4_k_m"), "vllm")).toEqual({
      engineId: "llamacpp",
      kvCacheFillPct: 100,
    });
  });

  it("snaps AWQ→MLX to the llama.cpp preset (MLX shares the 100% pre-allocation slot)", () => {
    expect(pickCompatibleEngine(setFor("mlx_4bit"), "vllm")).toEqual({
      engineId: "llamacpp",
      kvCacheFillPct: 100,
    });
  });

  it("treats undefined engineId as 'no current selection' and picks the first compatible preset", () => {
    // Legacy URLs without engineId — pick a sensible default rather than
    // leaving things in an ambiguous state.
    expect(pickCompatibleEngine(setFor("awq_4bit"), undefined)).toEqual({
      engineId: "vllm",
      kvCacheFillPct: 25,
    });
  });

  it("Float family is compatible with every engine (no snap)", () => {
    expect(pickCompatibleEngine(setFor("fp16"), "llamacpp")).toBeNull();
    expect(pickCompatibleEngine(setFor("fp16"), "vllm")).toBeNull();
    expect(pickCompatibleEngine(setFor("fp16"), "tensorrt")).toBeNull();
  });
});

// ─── Tests: trigger labels ──────────────────────────────────────────────────

describe("ConcurrentUsersInput — trigger labels reflect current value", () => {
  it("shows '1 user' singular and 'N users' plural for preset values", () => {
    const { rerender } = renderInput({ concurrentUsers: 1 });
    expect(usersTrigger()).toHaveTextContent("1 user");
    expect(usersTrigger()).not.toHaveTextContent("1 users");

    rerender(
      <ConcurrentUsersInput
        concurrentUsers={4}
        kvCacheFillPct={100}
        quant="fp16"
        onConcurrentUsersChange={vi.fn()}
        onKvCacheFillPctChange={vi.fn()}
        onEngineChange={vi.fn()}
      />,
    );
    expect(usersTrigger()).toHaveTextContent("4 users");
  });

  it("shows the matching engine preset when engineId is set", () => {
    const { rerender } = renderInput({
      engineId: "llamacpp",
      kvCacheFillPct: 100,
    });
    expect(engineTrigger()).toHaveTextContent("Pre-allocation · 100% KV");

    rerender(
      <ConcurrentUsersInput
        concurrentUsers={1}
        kvCacheFillPct={25}
        engineId="vllm"
        quant="fp16"
        onConcurrentUsersChange={vi.fn()}
        onKvCacheFillPctChange={vi.fn()}
        onEngineChange={vi.fn()}
      />,
    );
    expect(engineTrigger()).toHaveTextContent("PagedAttention · 25% KV");

    rerender(
      <ConcurrentUsersInput
        concurrentUsers={1}
        kvCacheFillPct={30}
        engineId="tensorrt"
        quant="fp16"
        onConcurrentUsersChange={vi.fn()}
        onKvCacheFillPctChange={vi.fn()}
        onEngineChange={vi.fn()}
      />,
    );
    expect(engineTrigger()).toHaveTextContent("TensorRT-LLM · 30% KV");
  });

  it("falls back to 'Custom · …' for off-preset users and explicit custom engineId", () => {
    renderInput({
      concurrentUsers: 5,
      kvCacheFillPct: 60,
      engineId: CUSTOM_ENGINE_ID,
    });
    expect(usersTrigger()).toHaveTextContent("Custom · 5 users");
    expect(engineTrigger()).toHaveTextContent("Custom · 60% KV");
  });

  it("BACKWARD-COMPAT: shared URL without engineId still recognises the preset by pct", () => {
    renderInput({ kvCacheFillPct: 25, engineId: undefined });
    expect(engineTrigger()).toHaveTextContent("PagedAttention · 25% KV");
  });
});

// ─── Tests: explicit custom vs preset value ────────────────────────────────

describe("ConcurrentUsersInput — engineId='custom' wins over pct matching", () => {
  it("renders Custom (and reveals the input) even when pct equals 100", () => {
    // Without engineId tracking this case was indistinguishable from the
    // llamacpp preset — exactly the bug the new field exists to prevent.
    renderInput({ engineId: CUSTOM_ENGINE_ID, kvCacheFillPct: 100 });
    expect(engineTrigger()).toHaveTextContent("Custom · 100% KV");
    expect(engineCustomInput()).not.toBeNull();
  });
});

// ─── Tests: custom input visibility ────────────────────────────────────────

describe("ConcurrentUsersInput — custom inputs appear iff value is off-preset", () => {
  it("hides both custom inputs when both values match presets", () => {
    renderInput({
      concurrentUsers: 4,
      kvCacheFillPct: 25,
      engineId: "vllm",
    });
    expect(usersCustomInput()).toBeNull();
    expect(engineCustomInput()).toBeNull();
  });

  it("shows the users custom input when concurrentUsers is off-preset", () => {
    renderInput({
      concurrentUsers: 5,
      kvCacheFillPct: 100,
      engineId: "llamacpp",
    });
    const input = usersCustomInput();
    expect(input).not.toBeNull();
    expect(input!.value).toBe("5");
    expect(engineCustomInput()).toBeNull();
  });

  it("shows the engine custom input for explicit custom engineId", () => {
    renderInput({
      concurrentUsers: 1,
      kvCacheFillPct: 60,
      engineId: CUSTOM_ENGINE_ID,
    });
    const input = engineCustomInput();
    expect(input).not.toBeNull();
    expect(input!.value).toBe("60");
    expect(usersCustomInput()).toBeNull();
  });
});

// ─── Tests: input clamping & validation ────────────────────────────────────

describe("ConcurrentUsersInput — number input clamps to bounds and ignores garbage", () => {
  it("clamps users above 256 down to 256", () => {
    const { onConcurrentUsersChange } = renderInput({ concurrentUsers: 5 });
    fireEvent.change(usersCustomInput()!, { target: { value: "9999" } });
    expect(onConcurrentUsersChange).toHaveBeenCalledWith(256);
  });

  it("clamps KV % below 1 up to 1", () => {
    // parseInt("0") = 0 < min=1 → must clamp UP to 1, otherwise the
    // calculator can divide by zero downstream.
    const { onKvCacheFillPctChange } = renderInput({
      kvCacheFillPct: 60,
      engineId: CUSTOM_ENGINE_ID,
    });
    fireEvent.change(engineCustomInput()!, { target: { value: "0" } });
    expect(onKvCacheFillPctChange).toHaveBeenCalledWith(1);
  });

  it("clamps KV % above 100 down to 100", () => {
    const { onKvCacheFillPctChange } = renderInput({
      kvCacheFillPct: 60,
      engineId: CUSTOM_ENGINE_ID,
    });
    fireEvent.change(engineCustomInput()!, { target: { value: "200" } });
    expect(onKvCacheFillPctChange).toHaveBeenCalledWith(100);
  });

  it("ignores non-numeric input entirely (no callback fired)", () => {
    const { onConcurrentUsersChange } = renderInput({ concurrentUsers: 5 });
    fireEvent.change(usersCustomInput()!, { target: { value: "abc" } });
    expect(onConcurrentUsersChange).not.toHaveBeenCalled();
  });

  it("forwards a valid in-range value verbatim", () => {
    const { onConcurrentUsersChange } = renderInput({ concurrentUsers: 5 });
    fireEvent.change(usersCustomInput()!, { target: { value: "12" } });
    expect(onConcurrentUsersChange).toHaveBeenCalledWith(12);
  });
});

// ─── Tests: dropdown selection (the real UX flow) ──────────────────────────

describe("ConcurrentUsersInput — dropdown selection drives callbacks", () => {
  it("selecting a users preset fires onConcurrentUsersChange with that number", async () => {
    const user = userEvent.setup();
    const { onConcurrentUsersChange } = renderInput({ concurrentUsers: 1 });

    await user.click(usersTrigger());
    const item = await screen.findByRole("option", { name: /^8 users$/ });
    await user.click(item);

    expect(onConcurrentUsersChange).toHaveBeenCalledWith(8);
  });

  it("selecting an engine preset fires onEngineChange with id AND pct", async () => {
    const user = userEvent.setup();
    const { onEngineChange, onKvCacheFillPctChange } = renderInput({
      engineId: "llamacpp",
      kvCacheFillPct: 100,
    });

    await user.click(engineTrigger());
    const item = await screen.findByRole("option", {
      name: /PagedAttention/,
    });
    await user.click(item);

    expect(onEngineChange).toHaveBeenCalledTimes(1);
    expect(onEngineChange).toHaveBeenCalledWith("vllm", 25);
    // pct setter is NOT called separately — onEngineChange carries both.
    expect(onKvCacheFillPctChange).not.toHaveBeenCalled();
  });

  it("typing a custom KV % does NOT touch onEngineChange (parent must do that)", () => {
    // The contract: typing in the manual input only emits pct. The parent
    // (ConfigCard) is responsible for stamping engineId='custom' alongside.
    // If this test starts failing it means the component is overstepping.
    const { onKvCacheFillPctChange, onEngineChange } = renderInput({
      kvCacheFillPct: 60,
      engineId: CUSTOM_ENGINE_ID,
    });
    fireEvent.change(engineCustomInput()!, { target: { value: "42" } });
    expect(onKvCacheFillPctChange).toHaveBeenCalledWith(42);
    expect(onEngineChange).not.toHaveBeenCalled();
  });
});

// ─── Tests: switching to / from Custom ─────────────────────────────────────

describe("ConcurrentUsersInput — switching engine to/from Custom", () => {
  it("picking Custom KV % fires onEngineChange('custom', currentPct)", async () => {
    const user = userEvent.setup();
    const { onEngineChange } = renderInput({
      engineId: "llamacpp",
      kvCacheFillPct: 100,
    });

    await user.click(engineTrigger());
    const customItem = await screen.findByRole("option", {
      name: /Custom KV %/,
    });
    await user.click(customItem);

    // Carries the previous pct so the manual input pre-fills with it once
    // the parent re-renders with engineId='custom'.
    expect(onEngineChange).toHaveBeenCalledWith(CUSTOM_ENGINE_ID, 100);
  });

  it("custom input becomes visible after the parent applies engineId='custom'", async () => {
    const user = userEvent.setup();
    let engineId: string | undefined = "llamacpp";
    let pct = 100;
    const onEngineChange = vi.fn((id: string, p: number) => {
      engineId = id;
      pct = p;
    });

    const { rerender } = render(
      <ConcurrentUsersInput
        concurrentUsers={1}
        kvCacheFillPct={pct}
        engineId={engineId}
        quant="fp16"
        onConcurrentUsersChange={vi.fn()}
        onKvCacheFillPctChange={vi.fn()}
        onEngineChange={onEngineChange}
      />,
    );
    expect(engineCustomInput()).toBeNull();

    await user.click(engineTrigger());
    const customItem = await screen.findByRole("option", {
      name: /Custom KV %/,
    });
    await user.click(customItem);

    rerender(
      <ConcurrentUsersInput
        concurrentUsers={1}
        kvCacheFillPct={pct}
        engineId={engineId}
        quant="fp16"
        onConcurrentUsersChange={vi.fn()}
        onKvCacheFillPctChange={vi.fn()}
        onEngineChange={onEngineChange}
      />,
    );
    expect(engineCustomInput()).not.toBeNull();
    expect(engineCustomInput()!.value).toBe("100");
  });
});

// ─── Tests: users force-custom (still local state) ─────────────────────────

describe("ConcurrentUsersInput — users Custom… can be picked at a preset value", () => {
  it("reveals the users custom input after selecting Custom… at a preset value", async () => {
    const user = userEvent.setup();
    const { onConcurrentUsersChange } = renderInput({ concurrentUsers: 1 });

    expect(usersCustomInput()).toBeNull();

    await user.click(usersTrigger());
    const customItem = await screen.findByRole("option", { name: /Custom…/ });
    await user.click(customItem);

    expect(usersCustomInput()).not.toBeNull();
    expect(usersCustomInput()!.value).toBe("1");
    expect(onConcurrentUsersChange).not.toHaveBeenCalled();

    fireEvent.change(usersCustomInput()!, { target: { value: "47" } });
    expect(onConcurrentUsersChange).toHaveBeenCalledWith(47);
  });

  it("hides the users custom input again when a preset is picked from Custom mode", async () => {
    const user = userEvent.setup();
    const onConcurrentUsersChange = vi.fn();
    const { rerender } = render(
      <ConcurrentUsersInput
        concurrentUsers={5}
        kvCacheFillPct={100}
        quant="fp16"
        onConcurrentUsersChange={onConcurrentUsersChange}
        onKvCacheFillPctChange={vi.fn()}
        onEngineChange={vi.fn()}
      />,
    );

    expect(usersCustomInput()).not.toBeNull();

    await user.click(usersTrigger());
    const item = await screen.findByRole("option", { name: /^16 users$/ });
    await user.click(item);

    expect(onConcurrentUsersChange).toHaveBeenCalledWith(16);

    rerender(
      <ConcurrentUsersInput
        concurrentUsers={16}
        kvCacheFillPct={100}
        quant="fp16"
        onConcurrentUsersChange={onConcurrentUsersChange}
        onKvCacheFillPctChange={vi.fn()}
        onEngineChange={vi.fn()}
      />,
    );
    expect(usersCustomInput()).toBeNull();
  });
});

// ─── Tests: dropdown content sanity ────────────────────────────────────────

describe("ConcurrentUsersInput — engine dropdown lists every documented engine family", () => {
  it("shows all engine families plus a Custom item", async () => {
    const user = userEvent.setup();
    renderInput();
    await user.click(engineTrigger());

    const listbox = await screen.findByRole("listbox");
    const utils = within(listbox);

    for (const preset of ENGINE_PRESETS) {
      expect(
        utils.getByText(new RegExp(`${preset.label} · ${preset.pct}% KV`)),
      ).toBeInTheDocument();
      expect(utils.getByText(preset.engines)).toBeInTheDocument();
    }
    expect(utils.getByText(/Custom KV %/)).toBeInTheDocument();
  });
});

// ─── Tests: engine filtering by quant family ───────────────────────────────
// Quant family decides which engines are physically capable of running the
// model (GGUF → llama.cpp; AWQ/GPTQ → vLLM/TensorRT; MLX → llama.cpp/MLX).
// The dropdown must hide incompatible options so the user can't pick an
// impossible combination — Custom KV % is always available as an escape
// hatch.

describe("ConcurrentUsersInput — engine dropdown filters by quant family", () => {
  it("GGUF (q4_k_m) shows only the Pre-allocation preset + Custom", async () => {
    const user = userEvent.setup();
    renderInput({ quant: "q4_k_m", engineId: "llamacpp" });
    await user.click(engineTrigger());

    const listbox = await screen.findByRole("listbox");
    const utils = within(listbox);

    expect(utils.getByText(/Pre-allocation/)).toBeInTheDocument();
    expect(utils.queryByText(/PagedAttention/)).toBeNull();
    expect(utils.queryByText(/TensorRT-LLM/)).toBeNull();
    expect(utils.getByText(/Custom KV %/)).toBeInTheDocument();
  });

  it("AWQ (awq_4bit) hides Pre-allocation and shows GPU engines + Custom", async () => {
    const user = userEvent.setup();
    renderInput({ quant: "awq_4bit", engineId: "vllm", kvCacheFillPct: 25 });
    await user.click(engineTrigger());

    const listbox = await screen.findByRole("listbox");
    const utils = within(listbox);

    expect(utils.queryByText(/Pre-allocation/)).toBeNull();
    expect(utils.getByText(/PagedAttention/)).toBeInTheDocument();
    // "TensorRT-LLM" appears twice (option label + sub-label) — match either.
    expect(utils.queryAllByText(/TensorRT-LLM/).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(utils.getByText(/Custom KV %/)).toBeInTheDocument();
  });

  it("GPTQ (gptq_4bit) hides Pre-allocation just like AWQ", async () => {
    const user = userEvent.setup();
    renderInput({ quant: "gptq_4bit", engineId: "vllm", kvCacheFillPct: 25 });
    await user.click(engineTrigger());

    const listbox = await screen.findByRole("listbox");
    const utils = within(listbox);

    expect(utils.queryByText(/Pre-allocation/)).toBeNull();
    expect(utils.getByText(/PagedAttention/)).toBeInTheDocument();
    // "TensorRT-LLM" appears twice (option label + sub-label) — match either.
    expect(utils.queryAllByText(/TensorRT-LLM/).length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("MLX (mlx_4bit) shows only Pre-allocation (the runtime that hosts MLX)", async () => {
    const user = userEvent.setup();
    renderInput({ quant: "mlx_4bit", engineId: "llamacpp" });
    await user.click(engineTrigger());

    const listbox = await screen.findByRole("listbox");
    const utils = within(listbox);

    expect(utils.getByText(/Pre-allocation/)).toBeInTheDocument();
    expect(utils.queryByText(/PagedAttention/)).toBeNull();
    expect(utils.queryByText(/TensorRT-LLM/)).toBeNull();
  });

  it("Float (fp16) shows every engine — no family restriction", async () => {
    const user = userEvent.setup();
    renderInput({ quant: "fp16", engineId: "llamacpp" });
    await user.click(engineTrigger());

    const listbox = await screen.findByRole("listbox");
    const utils = within(listbox);

    expect(utils.getByText(/Pre-allocation/)).toBeInTheDocument();
    expect(utils.getByText(/PagedAttention/)).toBeInTheDocument();
    // "TensorRT-LLM" appears twice in the option (label + sub-label
    // "Triton + TensorRT-LLM"). Both must be present, so use queryAllByText.
    expect(utils.queryAllByText(/TensorRT-LLM/).length).toBeGreaterThanOrEqual(
      1,
    );
  });
});
