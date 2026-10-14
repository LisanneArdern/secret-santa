import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Not signed in, so this exercises the redirect-to-sign-in state rather
// than the form itself — the signed-in form is axe-checked in
// journey-1.spec.ts, which can actually sign in first.
test("create-round page redirects to sign-in with no a11y violations", async ({ page }) => {
  await page.goto("/rounds/new");
  await page.waitForURL(/\/sign-in/);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
