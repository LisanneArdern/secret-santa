import type { Page } from "@playwright/test";
import { getLatestMagicLinkParams } from "../factories/mailpit";

/**
 * Drives the real magic-link sign-in flow via Mailpit (the local Supabase
 * stack's email catcher — Resend's own notification emails never appear
 * here, only Supabase Auth's). Assumes `page` is already on `/sign-in`
 * (with whatever `next`/`email` query params the caller wants); reads
 * `next` back off that URL so the post-confirm redirect lands wherever
 * the caller expects.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  const next = new URL(page.url()).searchParams.get("next") ?? "/";

  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await page.getByRole("heading", { name: "Check your email" }).waitFor();

  const { tokenHash, type } = await getLatestMagicLinkParams(email);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=${type}&next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: "Confirm sign-in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/confirm"));
}
