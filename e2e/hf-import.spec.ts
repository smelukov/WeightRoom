import { test, expect, type Page } from "@playwright/test";

const MOCK_REPO = "test-org/MyModel-7B";
const MOCK_HF_URL = `https://huggingface.co/${MOCK_REPO}`;

const MOCK_CONFIG = {
  num_hidden_layers: 32,
  num_key_value_heads: 8,
  num_attention_heads: 32,
  hidden_size: 4096,
  max_position_embeddings: 131072,
  model_type: "llama",
};

const MOCK_API = {
  modelId: MOCK_REPO,
  pipeline_tag: "text-generation",
  tags: ["transformers", "safetensors"],
  safetensors: { total: 7_241_732_096, parameters: { BF16: 7_241_732_096 } },
};

async function mockHuggingFace(page: Page) {
  await page.route("**huggingface.co/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/models/")) {
      await route.fulfill({ json: MOCK_API });
    } else if (url.includes("tokenizer_config.json")) {
      await route.fulfill({ json: { chat_template: "... tool_calls ..." } });
    } else if (url.includes("config.json")) {
      await route.fulfill({ json: MOCK_CONFIG });
    } else {
      await route.continue();
    }
  });
}

/** Opens the model selector combobox, types the HF URL and triggers import. */
async function importHfUrl(page: Page, url: string) {
  await page.locator('[data-slot="combobox-trigger"]').first().click();
  // The search input is identified by its placeholder (no data-slot on the input element)
  const searchInput = page.getByPlaceholder(/search or paste hf link/i);
  await searchInput.waitFor({ state: "visible" });
  await searchInput.fill(url);
  await searchInput.press("Enter");
  // Wait for fetch responses + React state update
  await page.waitForTimeout(1500);
}

test.describe("HuggingFace model import", () => {
  test.beforeEach(async ({ page }) => {
    await mockHuggingFace(page);
    await page.goto("/");
    await page.waitForSelector(".text-4xl");
  });

  test("pasting a HF URL activates custom model mode", async ({ page }) => {
    await importHfUrl(page, MOCK_HF_URL);

    // The trigger should now show "Custom" instead of the default model name
    await expect(
      page.locator('[data-slot="combobox-trigger"]').first(),
    ).toContainText(/custom/i);
  });

  test("imported model applies detected BF16 precision as quant", async ({ page }) => {
    // Mock returns BF16 safetensors → detectedPrecision = "bf16"
    await importHfUrl(page, MOCK_HF_URL);

    await expect(
      page.locator('[data-slot="select-trigger"]').first(),
    ).toContainText(/BF16/i);
  });

  test("imported model RAM is in the expected range for a 7B BF16 model", async ({ page }) => {
    await importHfUrl(page, MOCK_HF_URL);

    // 7.24B params, BF16 (2 bytes/param), overhead 1.1
    // weights: 7.24e9 * 2 / 1e9 * 1.1 ≈ 15.9 GB
    const ramText = await page.locator(".text-4xl").first().textContent();
    const ram = parseFloat(ramText ?? "0");
    // BF16 7B model should use 15–20 GB
    expect(ram).toBeGreaterThan(14);
    expect(ram).toBeLessThan(25);
  });

  test("non-LLM model (text-to-image) shows an inaccuracy warning", async ({ page }) => {
    await page.route("**huggingface.co/api/models/**", async (route) => {
      await route.fulfill({ json: { ...MOCK_API, pipeline_tag: "text-to-image" } });
    });

    await importHfUrl(page, MOCK_HF_URL);

    // Warning text should appear mentioning the incompatible pipeline
    await expect(
      page.getByText(/text-to-image/i).or(page.getByText(/RAM estimate will be inaccurate/i)),
    ).toBeVisible();
  });

  test("404 on config.json shows error mentioning config.json", async ({ page }) => {
    await page.route("**huggingface.co/**/config.json", async (route) => {
      await route.fulfill({ status: 404, body: "Not found" });
    });

    await importHfUrl(page, MOCK_HF_URL);

    // Don't pin to a CSS class — they go through theme tokens now.
    // Use the actual error copy from src/lib/hf.ts so the test really
    // verifies that the 404 path runs (not just that a tooltip mentions
    // config.json somewhere on the page).
    await expect(
      page.getByText(/config\.json not found/i),
    ).toBeVisible();
  });

  test("gated model (401) shows authorization error", async ({ page }) => {
    await page.route("**huggingface.co/**/config.json", async (route) => {
      await route.fulfill({ status: 401, body: "Unauthorized" });
    });

    await importHfUrl(page, MOCK_HF_URL);

    await expect(
      page.getByText(/gated/i).or(page.getByText(/authorization/i)),
    ).toBeVisible();
  });
});
