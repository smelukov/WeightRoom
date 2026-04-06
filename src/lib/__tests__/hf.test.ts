import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseHfUrl, fetchHfConfig } from "../hf";

// ─── parseHfUrl ───────────────────────────────────────────────────────────────

describe("parseHfUrl", () => {
  it("extracts repo ID from a full model URL", () => {
    expect(parseHfUrl("https://huggingface.co/meta-llama/Llama-3.1-8B")).toBe(
      "meta-llama/Llama-3.1-8B",
    );
  });

  it("extracts repo ID from a URL with subpaths", () => {
    expect(
      parseHfUrl("https://huggingface.co/Qwen/Qwen3-8B/tree/main"),
    ).toBe("Qwen/Qwen3-8B");
  });

  it("extracts repo ID from a URL with query params", () => {
    expect(
      parseHfUrl("https://huggingface.co/deepseek-ai/DeepSeek-V3?foo=bar"),
    ).toBe("deepseek-ai/DeepSeek-V3");
  });

  it("returns null for a plain repo ID string (not a URL)", () => {
    expect(parseHfUrl("meta-llama/Llama-3.1-8B")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseHfUrl("")).toBeNull();
  });

  it("returns null for an unrelated URL", () => {
    expect(parseHfUrl("https://example.com/some/path")).toBeNull();
  });
});

// ─── fetchHfConfig ────────────────────────────────────────────────────────────

/**
 * Build a minimal mock config.json response payload.
 */
function makeConfigJson(overrides: Record<string, unknown> = {}) {
  return {
    num_hidden_layers: 32,
    num_key_value_heads: 8,
    num_attention_heads: 32,
    hidden_size: 4096,
    max_position_embeddings: 131072,
    model_type: "llama",
    ...overrides,
  };
}

/**
 * Build a minimal HF API response payload.
 */
function makeApiResponse(overrides: Record<string, unknown> = {}) {
  return {
    modelId: "test-org/test-model-7B",
    pipeline_tag: "text-generation",
    tags: ["transformers", "safetensors"],
    safetensors: { total: 7e9, parameters: { BF16: 7e9 } },
    ...overrides,
  };
}

/** Create a mock Response object with json() method. */
function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("fetchHfConfig", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Helper that sets up the three parallel fetch calls in the correct order:
   * 1. config.json
   * 2. tokenizer_config.json
   * 3. HF API
   */
  function setupFetch(
    configJson: unknown,
    tokenizerJson: unknown = { chat_template: "" },
    apiJson: unknown = makeApiResponse(),
    configStatus = 200,
  ) {
    const fetchMock = vi.fn();
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("tokenizer_config.json")) {
        return Promise.resolve(mockResponse(tokenizerJson));
      }
      if (url.includes("/api/models/")) {
        return Promise.resolve(mockResponse(apiJson));
      }
      // config.json
      return Promise.resolve(mockResponse(configJson, configStatus));
    });
    vi.stubGlobal("fetch", fetchMock);
  }

  // ── KV formula detection ─────────────────────────────────────────────────

  it("detects 'standard' formula for a plain transformer config", async () => {
    setupFetch(makeConfigJson());
    const result = await fetchHfConfig("test-org/test-model-7B");
    expect(result.model.kvFormula).toBe("standard");
  });

  it("detects 'mla' formula when kv_lora_rank is present", async () => {
    setupFetch(makeConfigJson({ kv_lora_rank: 512, qk_rope_head_dim: 64 }));
    const result = await fetchHfConfig("deepseek-ai/DeepSeek-V3");
    expect(result.model.kvFormula).toBe("mla");
    expect(result.model.kvLoraRank).toBe(512);
    expect(result.model.qkRopeHeadDim).toBe(64);
  });

  it("detects 'hybrid' formula via sliding_window_pattern", async () => {
    setupFetch(
      makeConfigJson({ sliding_window_pattern: 6, sliding_window: 4096, num_hidden_layers: 42 }),
    );
    const result = await fetchHfConfig("google/gemma-2-9b");
    expect(result.model.kvFormula).toBe("hybrid");
    // fullLayers = floor(42 / 6) = 7
    expect(result.model.fullLayers).toBe(7);
  });

  it("detects 'hybrid' formula via sliding_window + num_global_key_value_heads", async () => {
    setupFetch(
      makeConfigJson({
        sliding_window: 4096,
        num_global_key_value_heads: 4,
        global_head_dim: 256,
      }),
    );
    const result = await fetchHfConfig("google/gemma-3-27b-it");
    expect(result.model.kvFormula).toBe("hybrid");
    expect(result.model.fullKvHeads).toBe(4);
    expect(result.model.fullHeadDim).toBe(256);
  });

  it("detects 'linear_hybrid' formula via layer_types containing 'linear_attention'", async () => {
    const layerTypes = Array.from({ length: 32 }, (_, i) =>
      i % 4 === 0 ? "full_attention" : "linear_attention",
    );
    setupFetch(makeConfigJson({ layer_types: layerTypes }));
    const result = await fetchHfConfig("test-org/linear-hybrid-model");
    expect(result.model.kvFormula).toBe("linear_hybrid");
    // fullLayers = count of "full_attention" = 32/4 = 8
    expect(result.model.fullLayers).toBe(8);
  });

  it("detects 'hybrid' formula via layer_types without 'linear_attention'", async () => {
    const layerTypes = Array.from({ length: 32 }, (_, i) =>
      i % 2 === 0 ? "full_attention" : "sliding_attention",
    );
    setupFetch(makeConfigJson({ layer_types: layerTypes }));
    const result = await fetchHfConfig("test-org/hybrid-model");
    expect(result.model.kvFormula).toBe("hybrid");
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("throws a gated error on HTTP 401", async () => {
    setupFetch({}, {}, {}, 401);
    await expect(fetchHfConfig("gated-org/private-model")).rejects.toThrow(
      /gated/i,
    );
  });

  it("throws a descriptive error on HTTP 404 (config.json not found)", async () => {
    setupFetch({}, {}, {}, 404);
    await expect(fetchHfConfig("org/gguf-only-model")).rejects.toThrow(
      /config\.json/i,
    );
  });

  it("throws a network error when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );
    await expect(fetchHfConfig("org/any-model")).rejects.toThrow(
      /network error/i,
    );
  });

  // ── Warning detection ────────────────────────────────────────────────────

  it("sets warning for non-LLM pipeline_tag", async () => {
    setupFetch(makeConfigJson(), {}, makeApiResponse({ pipeline_tag: "text-to-image" }));
    const result = await fetchHfConfig("stability-ai/stable-diffusion");
    expect(result.warning).not.toBeNull();
    expect(result.warning).toContain("text-to-image");
  });

  it("sets warning for recurrent architecture tag 'rwkv'", async () => {
    setupFetch(
      makeConfigJson(),
      {},
      makeApiResponse({ pipeline_tag: "text-generation", tags: ["rwkv"] }),
    );
    const result = await fetchHfConfig("RWKV/rwkv-6-world-7b");
    expect(result.warning).not.toBeNull();
    expect(result.warning).toContain("rwkv");
  });

  it("sets warning for recurrent architecture tag 'mamba'", async () => {
    setupFetch(
      makeConfigJson(),
      {},
      makeApiResponse({ pipeline_tag: "text-generation", tags: ["mamba"] }),
    );
    const result = await fetchHfConfig("state-spaces/mamba-7b");
    expect(result.warning).not.toBeNull();
    expect(result.warning).toContain("mamba");
  });

  it("sets warning when layers or kvHeads cannot be detected", async () => {
    // Empty config → layers=0, kvHeads=0
    setupFetch({});
    const result = await fetchHfConfig("org/unknown-model");
    expect(result.warning).not.toBeNull();
    expect(result.warning).toContain("layers=0");
  });

  it("returns null warning for a standard text-generation model", async () => {
    setupFetch(makeConfigJson());
    const result = await fetchHfConfig("meta-llama/Llama-3.1-8B");
    expect(result.warning).toBeNull();
  });

  // ── Precision detection ──────────────────────────────────────────────────

  it("detects bf16 precision from safetensors dominant dtype BF16", async () => {
    setupFetch(
      makeConfigJson(),
      {},
      makeApiResponse({ safetensors: { total: 7e9, parameters: { BF16: 7e9 } } }),
    );
    const result = await fetchHfConfig("meta-llama/Llama-3.1-8B");
    expect(result.detectedPrecision).toBe("bf16");
  });

  it("detects q8_0 precision from safetensors FP8 dtype", async () => {
    setupFetch(
      makeConfigJson(),
      {},
      makeApiResponse({ safetensors: { total: 7e9, parameters: { F8_E4M3: 7e9 } } }),
    );
    const result = await fetchHfConfig("deepseek-ai/DeepSeek-V3");
    expect(result.detectedPrecision).toBe("q8_0");
  });

  it("detects q4 precision from safetensors INT4 dtype", async () => {
    setupFetch(
      makeConfigJson(),
      {},
      makeApiResponse({ safetensors: { total: 7e9, parameters: { INT4: 7e9 } } }),
    );
    const result = await fetchHfConfig("org/awq-model");
    expect(result.detectedPrecision).toBe("q4");
  });

  it("detects q1 precision from U32-packed weights and falls back to name-based params", async () => {
    setupFetch(
      makeConfigJson(),
      {},
      makeApiResponse({
        modelId: "mlx-community/Llama-3-8B-1bit",
        safetensors: {
          // U32-packed: total is unreliable (much lower than real param count)
          total: 250e6,
          parameters: { U32: 250e6 },
        },
      }),
    );
    const result = await fetchHfConfig("mlx-community/Llama-3-8B-1bit");
    expect(result.detectedPrecision).toBe("q1");
    // Should parse "8B" from the name, not use the unreliable safetensors total
    expect(result.model.params).toBe(8e9);
  });

  it("returns null detectedPrecision for F16 (user sets their own quant)", async () => {
    setupFetch(
      makeConfigJson(),
      {},
      makeApiResponse({ safetensors: { total: 7e9, parameters: { F16: 7e9 } } }),
    );
    const result = await fetchHfConfig("org/model-fp16");
    expect(result.detectedPrecision).toBeNull();
  });

  // ── Capabilities detection ───────────────────────────────────────────────

  it("detects VLM capability from pipeline_tag 'image-text-to-text'", async () => {
    setupFetch(
      makeConfigJson(),
      {},
      makeApiResponse({ pipeline_tag: "image-text-to-text" }),
    );
    const result = await fetchHfConfig("google/gemma-3-4b-it");
    expect(result.capabilities.vlm).toBe(true);
  });

  it("detects thinking capability from 'enable_thinking' in chat_template", async () => {
    setupFetch(makeConfigJson(), { chat_template: "... enable_thinking ... {%}" });
    const result = await fetchHfConfig("Qwen/Qwen3-8B");
    expect(result.capabilities.thinking).toBe(true);
  });

  it("detects tool use capability from 'tool_calls' in chat_template", async () => {
    setupFetch(makeConfigJson(), { chat_template: "... tool_calls ... {%}" });
    const result = await fetchHfConfig("meta-llama/Llama-3.1-8B-Instruct");
    expect(result.capabilities.toolUse).toBe(true);
  });

  it("no capabilities for a plain base model with empty chat_template", async () => {
    setupFetch(makeConfigJson(), { chat_template: "" });
    const result = await fetchHfConfig("meta-llama/Llama-3.1-8B");
    expect(result.capabilities.vlm).toBe(false);
    expect(result.capabilities.thinking).toBe(false);
    expect(result.capabilities.toolUse).toBe(false);
  });

  // ── Context length ────────────────────────────────────────────────────────

  it("derives maxContextK from max_position_embeddings", async () => {
    setupFetch(makeConfigJson({ max_position_embeddings: 131072 }));
    const result = await fetchHfConfig("org/model");
    expect(result.maxContextK).toBe(128); // 131072 / 1024
  });

  it("applies linear rope_scaling factor when no original_max_position_embeddings", async () => {
    // old-style: max_pos is BASE, effective = base * factor
    setupFetch(
      makeConfigJson({
        max_position_embeddings: 4096,
        rope_scaling: { type: "linear", factor: 8 },
      }),
    );
    const result = await fetchHfConfig("org/long-context-model");
    // effective = 4096 * 8 = 32768 → 32768 / 1024 = 32
    expect(result.maxContextK).toBe(32);
  });

  it("does NOT multiply when original_max_position_embeddings is present (already extended)", async () => {
    setupFetch(
      makeConfigJson({
        max_position_embeddings: 131072,
        rope_scaling: { type: "llama3", factor: 8, original_max_position_embeddings: 8192 },
      }),
    );
    const result = await fetchHfConfig("meta-llama/Llama-3.1-8B");
    // max_position_embeddings already is the final value
    expect(result.maxContextK).toBe(128); // 131072 / 1024
  });

  // ── MoE activeParams estimation ──────────────────────────────────────────
  // Structural path: inactive = L_moe · (E − k) · 3 · H · moe_I
  //                  active   = totalParams − inactive
  // Values taken from real HF configs to verify the estimate lands within
  // a reasonable tolerance of published figures.

  it("estimates activeParams structurally for Mixtral 8x7B (~12.9B active of 46.7B)", async () => {
    // Mixtral 8x7B: H=4096, intermediate_size=14336, E=8, k=2, L=32
    setupFetch(
      makeConfigJson({
        num_hidden_layers: 32,
        hidden_size: 4096,
        intermediate_size: 14336,
        num_local_experts: 8,
        num_experts_per_tok: 2,
        num_key_value_heads: 8,
        num_attention_heads: 32,
      }),
      { chat_template: "" },
      makeApiResponse({
        modelId: "mistralai/Mixtral-8x7B-v0.1",
        safetensors: { total: 46.7e9, parameters: { BF16: 46.7e9 } },
      }),
    );
    const result = await fetchHfConfig("mistralai/Mixtral-8x7B-v0.1");
    expect(result.model.moe).toBe(true);
    expect(result.model.activeParams).toBeDefined();
    // Tolerate ±10% — our formula assumes SwiGLU, ignores biases.
    const active = result.model.activeParams!;
    expect(active).toBeGreaterThan(11e9);
    expect(active).toBeLessThan(14e9);
    expect(result.warning).toBeNull();
  });

  it("estimates activeParams structurally for Qwen3-30B-A3B (~3B active of 30B)", async () => {
    // Qwen3-30B-A3B: H=2048, moe_intermediate_size=768, E=128, k=8, L=48
    setupFetch(
      makeConfigJson({
        num_hidden_layers: 48,
        hidden_size: 2048,
        moe_intermediate_size: 768,
        intermediate_size: 6144,
        num_experts: 128,
        num_experts_per_tok: 8,
        num_key_value_heads: 4,
        num_attention_heads: 32,
      }),
      { chat_template: "" },
      makeApiResponse({
        modelId: "Qwen/Qwen3-30B-A3B",
        safetensors: { total: 30e9, parameters: { BF16: 30e9 } },
      }),
    );
    const result = await fetchHfConfig("Qwen/Qwen3-30B-A3B");
    expect(result.model.activeParams).toBeDefined();
    const active = result.model.activeParams!;
    expect(active).toBeGreaterThan(2.4e9);
    expect(active).toBeLessThan(3.6e9);
    expect(result.warning).toBeNull();
  });

  it("excludes first_k_dense_replace dense layers (DeepSeek V3 style)", async () => {
    // Naively counting all layers as MoE would over-subtract the inactive
    // mass. Using L_moe = layers - first_k_dense_replace keeps the estimate
    // correct even when dense layers precede the routing.
    const withDenseReplace = {
      num_hidden_layers: 10,
      hidden_size: 1000,
      moe_intermediate_size: 1000,
      n_routed_experts: 10,
      num_experts_per_tok: 1,
      first_k_dense_replace: 3,
      num_key_value_heads: 4,
      num_attention_heads: 16,
    };
    setupFetch(
      makeConfigJson(withDenseReplace),
      { chat_template: "" },
      makeApiResponse({ safetensors: { total: 100e9, parameters: { BF16: 100e9 } } }),
    );
    const result = await fetchHfConfig("deepseek-ai/DeepSeek-Test");
    // inactive = (10 - 3) · (10 - 1) · 3 · 1000 · 1000 = 189e6
    // active   = 100e9 - 189e6 = 99.811e9
    expect(result.model.activeParams).toBe(100e9 - 189e6);
  });

  it("falls back to crude k/E ratio and warns when hidden_size is missing", async () => {
    // Malformed community upload: has expert counts but no hidden_size.
    setupFetch(
      {
        num_hidden_layers: 32,
        num_local_experts: 8,
        num_experts_per_tok: 2,
        num_key_value_heads: 8,
        num_attention_heads: 32,
      },
      { chat_template: "" },
      makeApiResponse({
        modelId: "community/some-moe-8x7b",
        safetensors: { total: 46e9, parameters: { BF16: 46e9 } },
      }),
    );
    const result = await fetchHfConfig("community/some-moe-8x7b");
    // Crude: 46e9 · (2 / 8) = 11.5e9
    expect(result.model.activeParams).toBe(11.5e9);
    expect(result.warning).not.toBeNull();
    expect(result.warning!.toLowerCase()).toContain("moe");
  });

  it("does not set activeParams for a dense (non-MoE) model", async () => {
    setupFetch(makeConfigJson());
    const result = await fetchHfConfig("meta-llama/Llama-3.1-8B");
    expect(result.model.moe).toBe(false);
    expect(result.model.activeParams).toBeUndefined();
  });

  it("does not set activeParams when num_experts_per_tok ≥ num_experts (degenerate dense)", async () => {
    // 4 experts with k=4 means every token hits all experts → equivalent
    // to a dense model; must NOT surface a bogus activeParams.
    setupFetch(
      makeConfigJson({
        num_local_experts: 4,
        num_experts_per_tok: 4,
        hidden_size: 4096,
        intermediate_size: 14336,
      }),
    );
    const result = await fetchHfConfig("test-org/weird-moe");
    expect(result.model.activeParams).toBeUndefined();
  });

  // ── text_config nesting ───────────────────────────────────────────────────

  // ── MoE activeParams estimation ──────────────────────────────────────────
  // The structural path computes:
  //   inactive = L_moe · (E − k) · 3 · H · moe_I
  //   active   = totalParams − inactive
  // We use real field values from Mixtral / Qwen3 MoE / DeepSeek to make sure
  // the estimate lands within a few percent of the official figures.

  it("estimates activeParams structurally for Mixtral 8x7B (~12.9B active of 46.7B)", async () => {
    // Mixtral 8x7B: H=4096, intermediate_size=14336, E=8, k=2, L=32
    // Expected active ≈ 12.9B (official)
    setupFetch(
      makeConfigJson({
        num_hidden_layers: 32,
        hidden_size: 4096,
        intermediate_size: 14336,
        num_local_experts: 8,
        num_experts_per_tok: 2,
        num_key_value_heads: 8,
        num_attention_heads: 32,
      }),
      { chat_template: "" },
      makeApiResponse({
        modelId: "mistralai/Mixtral-8x7B-v0.1",
        safetensors: { total: 46.7e9, parameters: { BF16: 46.7e9 } },
      }),
    );
    const result = await fetchHfConfig("mistralai/Mixtral-8x7B-v0.1");
    expect(result.model.moe).toBe(true);
    expect(result.model.activeParams).toBeDefined();
    // Tolerate ±10% — our structural formula assumes SwiGLU everywhere and
    // ignores biases, so the published active count can differ slightly.
    const active = result.model.activeParams!;
    expect(active).toBeGreaterThan(11e9);
    expect(active).toBeLessThan(14e9);
    // Structural path should NOT emit the "approximate" warning
    expect(result.warning).toBeNull();
  });

  it("estimates activeParams structurally for Qwen3-30B-A3B (~3B active of 30B)", async () => {
    // Qwen3-30B-A3B: H=2048, moe_intermediate_size=768, E=128, k=8, L=48
    // Expected active ≈ 3B (official)
    setupFetch(
      makeConfigJson({
        num_hidden_layers: 48,
        hidden_size: 2048,
        moe_intermediate_size: 768,
        intermediate_size: 6144,
        num_experts: 128,
        num_experts_per_tok: 8,
        num_key_value_heads: 4,
        num_attention_heads: 32,
      }),
      { chat_template: "" },
      makeApiResponse({
        modelId: "Qwen/Qwen3-30B-A3B",
        safetensors: { total: 30e9, parameters: { BF16: 30e9 } },
      }),
    );
    const result = await fetchHfConfig("Qwen/Qwen3-30B-A3B");
    expect(result.model.activeParams).toBeDefined();
    const active = result.model.activeParams!;
    // Expect close to 3B; tolerate ±20% because tied embeddings + biases
    // aren't modelled.
    expect(active).toBeGreaterThan(2.4e9);
    expect(active).toBeLessThan(3.6e9);
    expect(result.warning).toBeNull();
  });

  it("excludes first_k_dense_replace dense layers (DeepSeek V3 style)", async () => {
    // If we naively counted all layers as MoE, activeParams would be
    // over-subtracted (too low). The fix: use layers - first_k_dense_replace.
    const withDenseReplace = {
      num_hidden_layers: 10,
      hidden_size: 1000,
      moe_intermediate_size: 1000,
      n_routed_experts: 10,
      num_experts_per_tok: 1,
      first_k_dense_replace: 3,
      num_key_value_heads: 4,
      num_attention_heads: 16,
    };
    setupFetch(
      makeConfigJson(withDenseReplace),
      { chat_template: "" },
      makeApiResponse({ safetensors: { total: 100e9, parameters: { BF16: 100e9 } } }),
    );
    const result = await fetchHfConfig("deepseek-ai/DeepSeek-Test");
    // inactive = (10 - 3) · (10 - 1) · 3 · 1000 · 1000 = 7 · 9 · 3e6 = 189e6
    // active = 100e9 - 189e6 = 99.811e9
    expect(result.model.activeParams).toBe(100e9 - 189e6);
  });

  it("falls back to crude k/E ratio and warns when hidden_size is missing", async () => {
    // Malformed community upload: has MoE flags but no hidden_size.
    setupFetch(
      {
        num_hidden_layers: 32,
        num_local_experts: 8,
        num_experts_per_tok: 2,
        num_key_value_heads: 8,
        num_attention_heads: 32,
      },
      { chat_template: "" },
      makeApiResponse({
        modelId: "community/some-moe-8x7b",
        safetensors: { total: 46e9, parameters: { BF16: 46e9 } },
      }),
    );
    const result = await fetchHfConfig("community/some-moe-8x7b");
    // Crude: 46e9 · (2 / 8) = 11.5e9
    expect(result.model.activeParams).toBe(11.5e9);
    // Must warn about the rough estimate
    expect(result.warning).not.toBeNull();
    expect(result.warning!.toLowerCase()).toContain("moe");
  });

  it("does not set activeParams for a dense (non-MoE) model", async () => {
    setupFetch(makeConfigJson()); // no expert fields
    const result = await fetchHfConfig("meta-llama/Llama-3.1-8B");
    expect(result.model.moe).toBe(false);
    expect(result.model.activeParams).toBeUndefined();
  });

  it("does not set activeParams when num_experts_per_tok ≥ num_experts (all active = dense)", async () => {
    // Degenerate case: 4 experts with k=4 means every token hits all experts —
    // effectively dense. Should NOT produce a bogus activeParams.
    setupFetch(
      makeConfigJson({
        num_local_experts: 4,
        num_experts_per_tok: 4,
        hidden_size: 4096,
        intermediate_size: 14336,
      }),
    );
    const result = await fetchHfConfig("test-org/weird-moe");
    expect(result.model.activeParams).toBeUndefined();
  });

  it("resolves nested text_config (e.g. VLMs like LLaVA)", async () => {
    const nestedConfig = {
      model_type: "llava",
      text_config: {
        num_hidden_layers: 28,
        num_key_value_heads: 4,
        num_attention_heads: 16,
        hidden_size: 2048,
        max_position_embeddings: 32768,
      },
    };
    setupFetch(nestedConfig);
    const result = await fetchHfConfig("llava-hf/llava-1.5-7b-hf");
    expect(result.model.layers).toBe(28);
    expect(result.model.kvHeads).toBe(4);
  });
});
