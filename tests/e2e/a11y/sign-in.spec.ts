import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("sign-in page has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
