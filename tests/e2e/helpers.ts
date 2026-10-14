import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { getLatestMagicLinkParams } from "../factories/mailpit";

/**
 * Drives the real magic-link sign-in flow via Mailpit (the local Supabase
 * stack's email catcher — Resend's own notification emails never appear
 * here, only Supabase Auth's). Assumes `page` is already on `/sign-in`
 * (with whatever `next`/`email` query params the caller wants); reads
 * `next` back off that URL so the post-confirm redirect lands wherever
 * the caller expects. A brand-new user has no display name yet, so this
 * also completes the one-time /welcome step in between, same as a real
 * first-time sign-in would.
 */
export async function signIn(page: Page, email: string, displayName = "Test User"): Promise<void> {
  const next = new URL(page.url()).searchParams.get("next") ?? "/";

  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await page.getByRole("heading", { name: "Check your email" }).waitFor();

  const { tokenHash, type } = await getLatestMagicLinkParams(email);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=${type}&next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: "Confirm sign-in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/confirm"));

  if (new URL(page.url()).pathname === "/welcome") {
    const results = await new AxeBuilder({ page }).analyze();
    if (results.violations.length > 0) {
      throw new Error(`/welcome has accessibility violations: ${JSON.stringify(results.violations)}`);
    }

    await page.getByLabel("Your name").fill(displayName);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((url) => url.pathname !== "/welcome");
  }
}
