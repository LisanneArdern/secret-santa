import { describe, expect, it } from "vitest";
import * as completeRoute from "../../src/app/api/cron/complete-rounds/route";
import * as archiveRoute from "../../src/app/api/cron/archive-rounds/route";
import * as remindersRoute from "../../src/app/api/cron/signup-reminders/route";
import { getEmailSender } from "@/lib/email/get-email-sender";
import type { FakeEmailSender } from "../factories/fake-email-sender";
import { createAdminClient, createTestUser } from "../factories/supabase-clients";
import { createInvitation, createRound } from "../factories/round";

const CRON_SECRET = "test-cron-secret";

function callCron(getFn: (request: Request) => Promise<Response>, path: string, authorized = true) {
  const headers: Record<string, string> = {};
  if (authorized) headers.authorization = `Bearer ${CRON_SECRET}`;
  return getFn(new Request(`http://localhost${path}`, { headers }));
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe("GET /api/cron/complete-rounds", () => {
  it("rejects a request without the cron secret", async () => {
    const response = await callCron(completeRoute.GET, "/api/cron/complete-rounds", false);
    expect(response.status).toBe(401);
  });

  it("completes a drawn round whose exchange date has passed", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, {
      organiserId: organiser.userId,
      state: "drawn",
      exchangeDate: new Date(Date.now() - DAY_MS),
    });

    // Doesn't assert on `completed`'s exact value: other rounds already
    // due for completion can be left over from an earlier local run
    // against the same database (CI always starts from a fresh one) — the
    // one invariant that matters is this test's own round.
    const response = await callCron(completeRoute.GET, "/api/cron/complete-rounds");
    expect(response.status).toBe(200);

    const { data } = await admin.from("rounds").select("state").eq("id", round.id).single();
    expect(data?.state).toBe("completed");
  });

  it("leaves a drawn round alone before its exchange date", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, {
      organiserId: organiser.userId,
      state: "drawn",
      exchangeDate: new Date(Date.now() + DAY_MS),
    });

    await callCron(completeRoute.GET, "/api/cron/complete-rounds");

    const { data } = await admin.from("rounds").select("state").eq("id", round.id).single();
    expect(data?.state).toBe("drawn");
  });

  it("leaves a drawn round with no exchange date alone", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "drawn" });

    await callCron(completeRoute.GET, "/api/cron/complete-rounds");

    const { data } = await admin.from("rounds").select("state").eq("id", round.id).single();
    expect(data?.state).toBe("drawn");
  });
});

describe("GET /api/cron/archive-rounds", () => {
  it("rejects a request without the cron secret", async () => {
    const response = await callCron(archiveRoute.GET, "/api/cron/archive-rounds", false);
    expect(response.status).toBe(401);
  });

  it("[AC-PRIV-05] deletes all personal data of a round 60 days after its exchange date", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const member = await createTestUser(admin);
    const round = await createRound(admin, {
      organiserId: organiser.userId,
      state: "completed",
      exchangeDate: new Date(Date.now() - 61 * DAY_MS),
    });
    const participant = await admin
      .from("participants")
      .insert({ round_id: round.id, user_id: member.userId })
      .select()
      .single();
    await admin.from("participant_wishes").insert({ participant_id: participant.data!.id, wishes: "Socks" });

    // Doesn't assert on `archived`'s exact value — see the matching
    // comment on the complete-rounds test above.
    const response = await callCron(archiveRoute.GET, "/api/cron/archive-rounds");
    expect(response.status).toBe(200);

    const { data: roundRow } = await admin.from("rounds").select("id").eq("id", round.id).maybeSingle();
    expect(roundRow).toBeNull();

    const { data: wishesRow } = await admin
      .from("participant_wishes")
      .select("participant_id")
      .eq("participant_id", participant.data!.id)
      .maybeSingle();
    expect(wishesRow).toBeNull();
  });

  it("leaves a completed round alone before the 60-day mark", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, {
      organiserId: organiser.userId,
      state: "completed",
      exchangeDate: new Date(Date.now() - 59 * DAY_MS),
    });

    await callCron(archiveRoute.GET, "/api/cron/archive-rounds");

    const { data } = await admin.from("rounds").select("id").eq("id", round.id).maybeSingle();
    expect(data).not.toBeNull();
  });

  it("never archives a drawn (not yet completed) round, no matter how old", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, {
      organiserId: organiser.userId,
      state: "drawn",
      exchangeDate: new Date(Date.now() - 365 * DAY_MS),
    });

    await callCron(archiveRoute.GET, "/api/cron/archive-rounds");

    const { data } = await admin.from("rounds").select("id").eq("id", round.id).maybeSingle();
    expect(data).not.toBeNull();
  });
});

describe("GET /api/cron/signup-reminders", () => {
  it("rejects a request without the cron secret", async () => {
    const response = await callCron(remindersRoute.GET, "/api/cron/signup-reminders", false);
    expect(response.status).toBe(401);
  });

  it("emails invitees who haven't joined yet, once, as the deadline approaches", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, {
      organiserId: organiser.userId,
      state: "open",
      signupDeadline: new Date(Date.now() + 2 * DAY_MS),
    });
    const email = `not-yet-joined-${Date.now()}@example.com`;
    await createInvitation(admin, { roundId: round.id, email });

    // Other integration test files leave their own "open" rounds behind in
    // this shared database (never torn down between files), some of which
    // can also fall inside the reminder window — so this only asserts on
    // this test's own round and its own unique invitee email, never on a
    // global count across every round the job touched.
    const response = await callCron(remindersRoute.GET, "/api/cron/signup-reminders");
    expect(response.status).toBe(200);

    const sender = getEmailSender() as FakeEmailSender;
    expect(sender.sentTo(email)).toHaveLength(1);

    const { data } = await admin.from("rounds").select("signup_reminder_sent_at").eq("id", round.id).single();
    expect(data?.signup_reminder_sent_at).not.toBeNull();

    // Running the job again doesn't send a second reminder for the same round.
    await callCron(remindersRoute.GET, "/api/cron/signup-reminders");
    expect(sender.sentTo(email)).toHaveLength(1);
  });

  it("does not email an invitee who already joined", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, {
      organiserId: organiser.userId,
      state: "open",
      signupDeadline: new Date(Date.now() + 2 * DAY_MS),
    });
    const email = `already-joined-${Date.now()}@example.com`;
    const invitation = await createInvitation(admin, { roundId: round.id, email });
    await admin.from("invitations").update({ status: "joined" }).eq("id", invitation.id);

    await callCron(remindersRoute.GET, "/api/cron/signup-reminders");

    const sender = getEmailSender() as FakeEmailSender;
    expect(sender.sentTo(email)).toHaveLength(0);
  });

  it("does not email more than 3 days before the deadline", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, {
      organiserId: organiser.userId,
      state: "open",
      signupDeadline: new Date(Date.now() + 10 * DAY_MS),
    });
    const email = `too-early-${Date.now()}@example.com`;
    await createInvitation(admin, { roundId: round.id, email });

    await callCron(remindersRoute.GET, "/api/cron/signup-reminders");

    const sender = getEmailSender() as FakeEmailSender;
    expect(sender.sentTo(email)).toHaveLength(0);
  });
});
