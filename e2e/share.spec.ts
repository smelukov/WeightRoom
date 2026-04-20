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

  test("Share dialog → Link tab copies URL to clipboard", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".text-4xl");
    await page.waitForTimeout(800);

    await page.context().grantPermissions(["clipboard-write", "clipboard-read"]);

    // The Share button in the header now opens a modal (Link / Image / Badge /
    // Embed tabs) instead of copying the URL inline. The Link tab is the
    // default-active tab and contains the Copy button we want to drive.
    await page.getByRole("button", { name: /share configuration/i }).click();

    // Scope the lookup to the dialog so we don't accidentally grab a Copy
    // button rendered elsewhere on the page (and to ensure the modal is
    // actually mounted before clicking).
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();

    // CopyButton renders "Copy" by default and flips to "Copied!" on success.
    await dialog.getByRole("button", { name: /^copy$/i }).click();

    await expect(
      dialog.getByRole("button", { name: /copied!/i }),
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
