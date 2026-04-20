import { test, expect, type Page } from "@playwright/test";

const modelTrigger = (page: Page) =>
  page.locator('[data-slot="combobox-trigger"]').first();

const weightsQuantTrigger = (page: Page) =>
  page.locator('[data-testid="weights-quant-trigger"]');

test.describe("URL state sharing", () => {
  test("state is written to URL after initial render (debounced 500ms)", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".text-4xl");
    await page.waitForTimeout(800);

    expect(page.url()).toContain("?s=");

    // URL-safe base64 must not contain +, /, or = (would break copy-paste)
    const s = new URL(page.url()).searchParams.get("s");
    expect(s).toBeTruthy();
    expect(s).not.toMatch(/[+/=]/);
  });

  test("opening a shared URL restores the same model", async ({ page, context }) => {
    await page.goto("/");
    await page.waitForSelector(".text-4xl");

    // Change to a distinct model (Llama 3.1 8B ≠ default Qwen 3.5 27B)
    await modelTrigger(page).click();
    const searchInput = page.getByPlaceholder(/search or paste hf link/i);
    await searchInput.waitFor({ state: "visible" });
    await searchInput.fill("Llama 3.1 8B");
    await page
      .locator('[data-slot="combobox-item"]')
      .filter({ hasText: /Llama 3\.1 8B/ })
      .click();
    await page.waitForTimeout(800);

    const sharedUrl = page.url();
    expect(sharedUrl).toContain("?s=");

    // Open in a fresh tab (no prior state)
    const page2 = await context.newPage();
    await page2.goto(sharedUrl);
    await page2.waitForSelector(".text-4xl");

    await expect(
      page2.locator('[data-slot="combobox-trigger"]').first(),
    ).toContainText(/Llama 3\.1 8B/i);
  });

  test("opening a shared URL restores the quantization", async ({ page, context }) => {
    await page.goto("/");
    await page.waitForSelector(".text-4xl");

    // Switch to BF16
    await weightsQuantTrigger(page).click();
    await page.locator('[data-slot="select-item"]').filter({ hasText: /BF16 \(16-bit\)/i }).click();
    await page.waitForTimeout(800);

    const sharedUrl = page.url();

    const page2 = await context.newPage();
    await page2.goto(sharedUrl);
    await page2.waitForSelector(".text-4xl");

    await expect(
      page2.locator('[data-slot="select-trigger"]').first(),
    ).toContainText(/BF16/i);
  });

  test("sharing compare mode URL restores multiple cards and comparison chart", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.waitForSelector(".text-4xl");

    await page.getByRole("button", { name: /^Compare$/i }).click();
    await page.getByText("Add Configuration").click();
    await page.waitForTimeout(800);

    const sharedUrl = page.url();
    expect(sharedUrl).toContain("?s=");

    const page2 = await context.newPage();
    await page2.goto(sharedUrl);
    await page2.waitForSelector(".text-4xl");

    await expect(page2.locator('[data-slot="card-content"]')).toHaveCount(2);
    await expect(page2.getByText("Comparison Chart")).toBeVisible();
  });

  test("Share button shows 'Copied!' and puts URL in clipboard", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".text-4xl");
    await page.waitForTimeout(800);

    await page.context().grantPermissions(["clipboard-write", "clipboard-read"]);

    // Header buttons are icon-only with aria-labels (visible "Share" text was
    // removed when we moved to a tooltip-driven toolbar). Find by accessible
    // name; the label flips to "Copied!" on success.
    const shareBtn = page.getByRole("button", { name: /copy share link/i });
    await shareBtn.click();

    // The accessible name briefly changes to "Copied!" (driven by a 2-second
    // state flip). Wait for that flip rather than asserting on inner text —
    // the icon swap (Share → Check) makes textContent unreliable.
    await expect(
      page.getByRole("button", { name: /copied!/i }),
    ).toBeVisible();

    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardText).toBe(page.url());
  });

  test("invalid ?s= param falls back to default config silently", async ({ page }) => {
    await page.goto("/?s=!!this_is_not_valid!!");
    await page.waitForSelector(".text-4xl");

    // Must show the default model, not crash
    await expect(
      page.locator('[data-slot="combobox-trigger"]').first(),
    ).toContainText(/Qwen 3\.5 27B/i);
  });
});
