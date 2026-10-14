import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

// SPEC.md's end-to-end journey 1, cut down per ROADMAP.md's first
// milestone: organiser creates a round, invites 3 people by email, all
// join and add wishes, organiser draws, each person sees only their own
// giftee. Runs against the real app, a real local Supabase instance
// (sign-in, DB, RLS), and real magic links via Mailpit — nothing here is
// mocked. Deferred from this cut-down version, per the roadmap: automatic
// draw, redraw-on-removal, reminders, archival, wishes-required gating,
// link invites, bounce handling.
test("journey 1 (cut-down): create, invite, join, draw, see only your own giftee", async ({ browser }) => {
  test.setTimeout(120_000);

  const now = Date.now();
  const organiserEmail = `journey-organiser-${now}@example.com`;
  const inviteeEmails = [0, 1, 2].map((i) => `journey-invitee-${i}-${now}@example.com`);
  const wishesByInvitee = ["Board games", "Warm socks", "A good book"];

  const contexts = [await browser.newContext()];
  const organiserPage = await contexts[0].newPage();

  await test.step("organiser signs in and creates a round", async () => {
    await organiserPage.goto("/sign-in");
    await signIn(organiserPage, organiserEmail);

    await organiserPage.goto("/rounds/new");
    const createRoundA11y = await new AxeBuilder({ page: organiserPage }).analyze();
    expect(createRoundA11y.violations).toEqual([]);

    await organiserPage.locator("#name").fill("Journey 1 Christmas");
    await organiserPage.locator("#budget-amount").fill("20.00");
    const deadline = new Date(now + 2 * 86_400_000).toISOString().slice(0, 10);
    await organiserPage.locator("#signup-deadline").fill(deadline);
    await organiserPage.getByRole("button", { name: "Create round" }).click();
    await organiserPage.waitForURL(/\/rounds\/[0-9a-f-]+$/);
  });

  const roundUrl = organiserPage.url();

  await test.step("organiser invites 3 people by email", async () => {
    for (const email of inviteeEmails) {
      await organiserPage.getByLabel(/Invite by email/).fill(email);
      await organiserPage.getByRole("button", { name: "Invite" }).click();
      await expect(organiserPage.getByText(email)).toBeVisible();
    }
  });

  await test.step("the organiser's round page (real invite data) has no automatically detectable accessibility violations", async () => {
    const results = await new AxeBuilder({ page: organiserPage }).analyze();
    expect(results.violations).toEqual([]);
  });

  // Resend's own notification emails (the invite email) don't flow through
  // Mailpit, and this environment has no real Resend credentials either —
  // get the invite links the way the organiser's own UI already exposes
  // them, rather than waiting on an email that can't arrive here.
  const inviteUrls = await organiserPage.$$eval("a[href*='/invite/']", (as) =>
    as.map((a) => (a as HTMLAnchorElement).href),
  );
  expect(inviteUrls).toHaveLength(3);

  const inviteePages: Page[] = [];

  for (let i = 0; i < inviteeEmails.length; i++) {
    const email = inviteeEmails[i];
    await test.step(`invitee ${i + 1} joins via their invite link and adds wishes`, async () => {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      inviteePages.push(page);

      await page.goto(inviteUrls[i]);
      if (i === 0) {
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);
      }

      await page.getByRole("button", { name: "Sign in to join" }).click();
      await page.waitForURL(/\/sign-in/);
      await signIn(page, email);

      await page.getByRole("button", { name: "Join round" }).click();
      await expect(page.getByText("You're in!")).toBeVisible();

      await page.goto(roundUrl);
      await page.getByLabel(/What would you like/).fill(wishesByInvitee[i]);
      await page.getByRole("button", { name: "Save my wishes" }).click();
      await expect(page.getByText("Saved.")).toBeVisible();
    });
  }

  await test.step("organiser draws names", async () => {
    await organiserPage.reload();
    await organiserPage.getByRole("button", { name: "Draw names" }).click();
    await expect(organiserPage.getByText("Names have been drawn.")).toBeVisible();
  });

  await test.step("each of the 4 people sees only their own giftee's wishes", async () => {
    const seenWishes: string[] = [];

    for (const page of [organiserPage, ...inviteePages]) {
      await page.goto(`${roundUrl}/giftee`);
      await expect(page.getByRole("heading", { name: "My giftee" })).toBeVisible();
      const body = (await page.textContent("body")) ?? "";
      seenWishes.push(wishesByInvitee.find((w) => body.includes(w)) ?? "(none)");
    }

    // A perfect matching: all 4 giftees distinct, and no invitee drew
    // themselves (AC-DRAW: nobody is their own giftee).
    expect(new Set(seenWishes).size).toBe(4);
    wishesByInvitee.forEach((ownWishes, i) => {
      expect(seenWishes[i + 1]).not.toBe(ownWishes);
    });
  });

  await test.step("the My giftee page (real wishes content) has no automatically detectable accessibility violations", async () => {
    const results = await new AxeBuilder({ page: inviteePages[0] }).analyze();
    expect(results.violations).toEqual([]);
  });

  for (const context of contexts) {
    await context.close();
  }
});
