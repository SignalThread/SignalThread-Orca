import { test, expect } from "@playwright/test";

/**
 * UI-only sanity for OTP-era login — does **not** need auth storage or inbox access.
 */
test.describe("login otp ui smoke", () => {
  test("email phase shows OTP send action and no password field", async ({ page }) => {
    await page.goto("http://localhost:3000/login");
    await expect(page.getByRole("button", { name: /email sign-in code/i })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByLabel("Email")).toBeVisible();
  });
});
