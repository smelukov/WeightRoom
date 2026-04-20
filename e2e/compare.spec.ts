import { test, expect, type Page } from "@playwright/test";

const modelTrigger = (page: Page, nth = 0) =>
  page.locator('[data-slot="combobox-trigger"]').nth(nth);

const weightsQuantTrigger = (page: Page, cardNth = 0) =>
  page
    .locator('[data-slot="card-content"]')
    .nth(cardNth)
    .locator('[data-testid="weights-quant-trigger"]');

async function selectOption(page: Page, text: RegExp | string) {
  await page.locator('[data-slot="select-item"]').filter({ hasText: text }).click();
}

test.describe("Compare mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".text-4xl");
    await page.getByRole("button", { name: /^Compare$/i }).click();
    await page.waitForTimeout(200);
  });

  test("starts with one card and no comparison chart", async ({ page }) => {
    await expect(page.locator('[data-slot="card-content"]')).toHaveCount(1);
    // Chart must NOT appear with a single config
    await expect(page.getByText("Comparison Chart")).not.toBeVisible();
  });

  test("comparison chart appears after adding a second card", async ({ page }) => {
    await page.getByText("Add Configuration").click();
    await page.waitForTimeout(300);

    await expect(page.locator('[data-slot="card-content"]')).toHaveCount(2);
    await expect(page.getByText("Comparison Chart")).toBeVisible();
  });

  test("new card inherits the model from the previous card", async ({ page }) => {
    // Confirm first card has the default model
    await expect(modelTrigger(page, 0)).toContainText(/Qwen 3\.5 27B/i);

    await page.getByText("Add Configuration").click();
    await page.waitForTimeout(300);

    // Second card should also show the same model (inherited from last card)
    await expect(modelTrigger(page, 1)).toContainText(/Qwen 3\.5 27B/i);
  });

  test("removing a card back to one hides the comparison chart", async ({ page }) => {
    await page.getByText("Add Configuration").click();
    await page.waitForTimeout(300);
    await expect(page.getByText("Comparison Chart")).toBeVisible();

    // The × remove button appears on each card when there are ≥ 2 configs.
    // Use the aria-label as the stable accessible name for this button.
    const removeButtons = page.getByRole("button", { name: /remove this card/i });
    await removeButtons.last().click();
    await page.waitForTimeout(300);

    await expect(page.locator('[data-slot="card-content"]')).toHaveCount(1);
    await expect(page.getByText("Comparison Chart")).not.toBeVisible();
  });

  test("max 6 cards — Add Configuration button disappears at limit", async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.getByText("Add Configuration").click();
      await page.waitForTimeout(150);
    }

    await expect(page.locator('[data-slot="card-content"]')).toHaveCount(6);
    // Button hidden when configs.length >= 6
    await expect(page.getByText("Add Configuration")).not.toBeVisible();
  });

  test("changing quant on card 2 does not affect card 1 RAM", async ({ page }) => {
    await page.getByText("Add Configuration").click();
    await page.waitForTimeout(300);

    // Read initial RAM for both cards (they're identical clones)
    const card1Ram = parseFloat(
      (await page.locator(".text-4xl").nth(0).textContent()) ?? "0",
    );
    const card2Ram = parseFloat(
      (await page.locator(".text-4xl").nth(2).textContent()) ?? "0",
    );
    expect(card1Ram).toBe(card2Ram); // cloned → same initial value

    // Change quant on the second card only (cardNth=1)
    await weightsQuantTrigger(page, 1).click();
    await selectOption(page, /BF16 \(16-bit\)/i);
    await page.waitForTimeout(200);

    const card1After = parseFloat(
      (await page.locator(".text-4xl").nth(0).textContent()) ?? "0",
    );
    const card2After = parseFloat(
      (await page.locator(".text-4xl").nth(2).textContent()) ?? "0",
    );

    // Card 1 unchanged
    expect(card1After).toBe(card1Ram);
    // Card 2 now larger (BF16 ≈ 4× more weight bits)
    expect(card2After).toBeGreaterThan(card2Ram * 2);
  });
});
