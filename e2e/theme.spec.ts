import { test, expect } from "@playwright/test";

const themeToggle = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /toggle theme/i });

test.describe("Theme switcher", () => {
  test("default theme follows the OS preference (light here via emulateMedia)", async ({
    page,
  }) => {
    // Force a known prefers-color-scheme so the test is deterministic.
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.waitForSelector(".text-4xl");

    const html = page.locator("html");
    await expect(html).toHaveClass(/light/);
    await expect(html).not.toHaveClass(/dark/);
  });

  test("switching to Dark applies the .dark class and persists in localStorage", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.waitForSelector(".text-4xl");

    await themeToggle(page).click();
    await page.locator('[data-testid="theme-option-dark"]').click();

    await expect(page.locator("html")).toHaveClass(/dark/);
    const stored = await page.evaluate(() => localStorage.getItem("theme"));
    expect(stored).toBe("dark");
  });

  test("Light choice survives a reload (no flash to system default)", async ({
    page,
  }) => {
    // System would resolve to dark, so if persistence is broken we'd see dark.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.waitForSelector(".text-4xl");

    await themeToggle(page).click();
    await page.locator('[data-testid="theme-option-light"]').click();
    await expect(page.locator("html")).toHaveClass(/light/);

    await page.reload();
    await page.waitForSelector(".text-4xl");

    // Must still be light AFTER reload — proves the anti-flash bootstrap
    // and next-themes both honour the stored value.
    await expect(page.locator("html")).toHaveClass(/light/);
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("System choice tracks prefers-color-scheme changes", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.waitForSelector(".text-4xl");

    await themeToggle(page).click();
    await page.locator('[data-testid="theme-option-system"]').click();
    await expect(page.locator("html")).toHaveClass(/light/);

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
