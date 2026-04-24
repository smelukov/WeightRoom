import { test, expect, type Page } from "@playwright/test";

// Locator helpers matching the app's component structure

/** The model selector combobox trigger button. */
const modelTrigger = (page: Page) =>
  page.locator('[data-slot="combobox-trigger"]').first();

/** The Weights Quant select trigger. */
const weightsQuantTrigger = (page: Page) =>
  page.locator('[data-testid="weights-quant-trigger"]');

/** Select an option by text from an open Base UI Select dropdown. */
async function selectOption(page: Page, text: RegExp | string) {
  await page.locator('[data-slot="select-item"]').filter({ hasText: text }).click();
}

/** Get the total RAM GB value from the ResultCard (first big number on the page). */
async function getRamGb(page: Page): Promise<number> {
  // The RAM total is the first .text-4xl element.
  // textContent() returns something like "19\nGB" — parseFloat handles it.
  const text = await page.locator(".text-4xl").first().textContent();
  return parseFloat(text ?? "0");
}

/** Get the KV cache GB value from the BreakdownCard labeled "KV Cache". */
async function getKvCacheGb(page: Page): Promise<number> {
  // BreakdownCard: a span with "KV Cache" text + a sibling div with the value
  const card = page.locator("span").filter({ hasText: /^KV Cache$/ }).locator("../..");
  const text = await card.locator(".text-xs.font-semibold").textContent();
  return parseFloat(text ?? "0");
}

// Default config:
//   model: qwen3.6-27b (27B, linear_hybrid, 16 full layers, 32K context)
//   quant: q4_k_m (4-bit), kvQuant: bf16
//   expected RAM ≈ 19 GB
//
// NB: Qwen 3.6 27B uses the same architecture as the previous default
// (qwen3.5-27b) — same model_type "qwen3_5", same 64 layers / 16 full /
// 4 KV heads / head_dim 256. Numerical expectations below are unchanged.

test.describe("Single-card mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".text-4xl");
  });

  test("shows heading and default model 'Qwen 3.6 27B' in selector", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /WeightRoom/i }),
    ).toBeVisible();

    // The combobox trigger should show the default model name
    await expect(modelTrigger(page)).toContainText(/Qwen 3\.6 27B/i);
  });

  test("default config: RAM is ≈ 19 GB for a 27B q4_k_m model with 32K context", async ({ page }) => {
    const ram = await getRamGb(page);
    // 27B q4_k_m linear_hybrid, 32K context → ~19 GB
    // Range ±2 GB to tolerate potential model param updates
    expect(ram).toBeGreaterThanOrEqual(17);
    expect(ram).toBeLessThanOrEqual(22);

    // Storage column also renders (second .text-4xl): 27B * 4-bit * 1.05 + 20 OS ≈ 34 GB
    const storageText = await page.locator(".text-4xl").nth(1).textContent();
    const storage = parseFloat(storageText ?? "0");
    expect(storage).toBeGreaterThan(20);
  });

  test("switching to BF16 quant roughly quadruples RAM vs q4_k_m", async ({ page }) => {
    const ramBefore = await getRamGb(page); // q4_k_m, 4-bit

    await weightsQuantTrigger(page).click();
    await selectOption(page, /BF16 \(16-bit\)/i);
    await page.waitForTimeout(200);

    const ramAfter = await getRamGb(page); // bf16, 16-bit = 4× more bits

    // Weights alone are ~4× larger; with KV+OS, total should at least double
    expect(ramAfter).toBeGreaterThan(ramBefore * 2);

    // Selector must visually confirm the change
    await expect(weightsQuantTrigger(page)).toContainText(/BF16/i);
  });

  test("reducing context from 32K to 1K reduces KV cache portion", async ({ page }) => {
    const kvBefore = await getKvCacheGb(page); // 32K context
    expect(kvBefore).toBeGreaterThan(0); // sanity

    // The context number input is inside the ContextSlider
    const contextInput = page
      .locator("label")
      .filter({ hasText: /^Context Length$/ })
      .locator("../..")
      .locator('input[type="number"]');

    await contextInput.fill("1");
    await contextInput.press("Enter");
    await page.waitForTimeout(200);

    const kvAfter = await getKvCacheGb(page);

    // 32K → 1K = 32× fewer tokens → KV should be dramatically smaller
    expect(kvAfter).toBeLessThan(kvBefore);
    expect(kvAfter).toBeLessThan(kvBefore * 0.1); // < 10% of original
  });

  test("switching to a smaller model (Gemma 2 9B) reduces RAM", async ({ page }) => {
    const ramBefore = await getRamGb(page); // 27B model

    await modelTrigger(page).click();
    // The combobox search input is identified by its placeholder
    const searchInput = page.getByPlaceholder(/search or paste hf link/i);
    await searchInput.waitFor({ state: "visible" });
    await searchInput.fill("Gemma 2 9B");
    await page
      .locator('[data-slot="combobox-item"]')
      .filter({ hasText: /Gemma 2 9B/ })
      .click();
    await page.waitForTimeout(200);

    const ramAfter = await getRamGb(page);

    // 9B vs 27B → significantly less RAM
    expect(ramAfter).toBeLessThan(ramBefore);
    // Should also be confirmed in the trigger label
    await expect(modelTrigger(page)).toContainText(/Gemma 2 9B/i);
  });

  test("single mode shows exactly one config card", async ({ page }) => {
    await expect(page.locator('[data-slot="card-content"]')).toHaveCount(1);
  });
});
