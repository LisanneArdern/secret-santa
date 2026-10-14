import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as draw from "../../src/app/api/rounds/[id]/draw/route";
import * as redraw from "../../src/app/api/rounds/[id]/redraw/route";
import * as invitations from "../../src/app/api/rounds/[id]/invitations/route";
import * as removeParticipant from "../../src/app/api/rounds/[id]/participants/[participantId]/route";
import * as wishes from "../../src/app/api/rounds/[id]/wishes/route";
import { getEmailSender, setEmailSenderForTesting } from "@/lib/email/get-email-sender";
import { FakeEmailSender } from "../factories/fake-email-sender";
import { createAdminClient, createTestUser } from "../factories/supabase-clients";
import { addParticipant, createRound } from "../factories/round";

function authedRequest(url: string, accessToken: string, init: RequestInit = {}) {
  return new Request(url, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${accessToken}` },
  });
}

function callDraw(roundId: string, accessToken: string) {
  return draw.POST(authedRequest(`http://localhost/api/rounds/${roundId}/draw`, accessToken, { method: "POST" }), {
    params: Promise.resolve({ id: roundId }),
  });
}

function callRedraw(roundId: string, accessToken: string) {
  return redraw.POST(authedRequest(`http://localhost/api/rounds/${roundId}/redraw`, accessToken, { method: "POST" }), {
    params: Promise.resolve({ id: roundId }),
  });
}

function callInvite(roundId: string, accessToken: string, email?: string) {
  return invitations.POST(
    authedRequest(`http://localhost/api/rounds/${roundId}/invitations`, accessToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }),
    { params: Promise.resolve({ id: roundId }) },
  );
}

function callRemove(roundId: string, participantId: string, accessToken: string) {
  return removeParticipant.DELETE(
    authedRequest(`http://localhost/api/rounds/${roundId}/participants/${participantId}`, accessToken, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id: roundId, participantId }) },
  );
}

function callUpdateWishes(roundId: string, accessToken: string, body: { wishes?: string; notes?: string }) {
  return wishes.PATCH(
    authedRequest(`http://localhost/api/rounds/${roundId}/wishes`, accessToken, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: roundId }) },
  );
}

describe("notifications", () => {
  let fake: FakeEmailSender;

  beforeEach(() => {
    fake = new FakeEmailSender();
    setEmailSenderForTesting(fake);
  });

  afterEach(() => {
    setEmailSenderForTesting(null);
  });

  it("uses the fake sender by default in tests", () => {
    expect(getEmailSender()).toBe(fake);
  });

  it("[AC-NOTIF-01] sends each participant exactly one draw email naming only their own giftee", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);
    await admin.from("users").update({ display_name: "Organiser" }).eq("id", organiser.userId);
    await admin.from("users").update({ display_name: "Alice" }).eq("id", a.userId);
    await admin.from("users").update({ display_name: "Bob" }).eq("id", b.userId);

    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await addParticipant(admin, round.id, organiser.userId);
    await addParticipant(admin, round.id, a.userId);
    await addParticipant(admin, round.id, b.userId);

    const response = await callDraw(round.id, organiser.accessToken);
    expect(response.status).toBe(200);

    expect(fake.sent).toHaveLength(3);
    for (const user of [organiser, a, b]) {
      expect(fake.sentTo(user.email)).toHaveLength(1);
    }

    const { data: assignments } = await admin.from("assignments").select("*").eq("round_id", round.id);
    const { data: participantsRows } = await admin.from("participants").select("id, user_id").eq("round_id", round.id);
    const { data: usersRows } = await admin
      .from("users")
      .select("id, email, display_name")
      .in("id", [organiser.userId, a.userId, b.userId]);

    for (const a2 of assignments!) {
      const giverUserId = participantsRows!.find((p) => p.id === a2.giver_id)!.user_id;
      const receiverUserId = participantsRows!.find((p) => p.id === a2.receiver_id)!.user_id;
      const giverEmail = usersRows!.find((u) => u.id === giverUserId)!.email;
      const receiverName = usersRows!.find((u) => u.id === receiverUserId)!.display_name;

      const [sentEmail] = fake.sentTo(giverEmail);
      expect(sentEmail.html).toContain(receiverName);
      // No other participant's name leaks into this giver's email.
      for (const otherName of ["Organiser", "Alice", "Bob"].filter((n) => n !== receiverName)) {
        expect(sentEmail.html).not.toContain(otherName);
      }
    }
  });

  it("[AC-NOTIF-01] a redraw sends each remaining participant one email with their new giftee", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await addParticipant(admin, round.id, organiser.userId);
    await addParticipant(admin, round.id, a.userId);
    await addParticipant(admin, round.id, b.userId);

    await callDraw(round.id, organiser.accessToken);
    fake.reset();

    const response = await callRedraw(round.id, organiser.accessToken);
    expect(response.status).toBe(200);
    expect(fake.sent).toHaveLength(3);
    for (const m of fake.sent) {
      expect(m.subject).toContain("changed");
    }
  });

  it("sends an invite email for an email invite, naming the round and organiser", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    await admin.from("users").update({ display_name: "Carol" }).eq("id", organiser.userId);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });

    const response = await callInvite(round.id, organiser.accessToken, "friend@example.com");
    expect(response.status).toBe(201);

    expect(fake.sentTo("friend@example.com")).toHaveLength(1);
    const [email] = fake.sentTo("friend@example.com");
    expect(email.subject).toContain("Carol");
    expect(email.html).toContain("/invite/");
  });

  it("sends no email for a link invite", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });

    const response = await callInvite(round.id, organiser.accessToken);
    expect(response.status).toBe(201);
    expect(fake.sent).toHaveLength(0);
  });

  it("notifies a removed participant", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await addParticipant(admin, round.id, organiser.userId);
    const participantA = await addParticipant(admin, round.id, a.userId);

    const response = await callRemove(round.id, participantA.id, organiser.accessToken);
    expect(response.status).toBe(200);

    expect(fake.sentTo(a.email)).toHaveLength(1);
    expect(fake.sentTo(a.email)[0].subject).toContain("removed");
  });

  it("[AC-DRAW-09 adjacent] removing a participant after the draw notifies remaining participants of their new giftee", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);
    const c = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await addParticipant(admin, round.id, organiser.userId);
    await addParticipant(admin, round.id, a.userId);
    const participantB = await addParticipant(admin, round.id, b.userId);
    await addParticipant(admin, round.id, c.userId);

    await callDraw(round.id, organiser.accessToken);
    fake.reset();

    const response = await callRemove(round.id, participantB.id, organiser.accessToken);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.redrawn).toBe(true);

    // b was removed (gets the "removed" email), the 3 remaining each get a
    // redraw email.
    expect(fake.sentTo(b.email)).toHaveLength(1);
    expect(fake.sentTo(b.email)[0].subject).toContain("removed");
    for (const user of [organiser, a, c]) {
      expect(fake.sentTo(user.email)).toHaveLength(1);
      expect(fake.sentTo(user.email)[0].subject).toContain("changed");
    }
  });

  it("[AC-NOTIF-02] notifies only the current giver when their giftee updates wishes", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);
    await admin.from("users").update({ display_name: "Bob" }).eq("id", b.userId);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await addParticipant(admin, round.id, organiser.userId);
    await addParticipant(admin, round.id, a.userId);
    const participantB = await addParticipant(admin, round.id, b.userId);

    await callDraw(round.id, organiser.accessToken);
    const { data: assignments } = await admin.from("assignments").select("*").eq("round_id", round.id);
    const bsGiver = assignments!.find((x) => x.receiver_id === participantB.id)!.giver_id;
    const giverUserId = (
      await admin.from("participants").select("user_id").eq("id", bsGiver).single()
    ).data!.user_id;
    const { data: giverUserRow } = await admin.from("users").select("email").eq("id", giverUserId).single();

    fake.reset();
    const response = await callUpdateWishes(round.id, b.accessToken, { wishes: "Warm socks" });
    expect(response.status).toBe(200);

    expect(fake.sentTo(giverUserRow!.email)).toHaveLength(1);
    expect(fake.sentTo(giverUserRow!.email)[0].html).toContain("Bob");

    // Nobody else (including the organiser, unless they're the giver) gets
    // this notification.
    const otherEmails = [organiser.email, a.email, b.email].filter((e) => e !== giverUserRow!.email);
    for (const email of otherEmails) {
      expect(fake.sentTo(email)).toHaveLength(0);
    }
  });

  it("does not notify anyone when wishes are updated before the draw", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await addParticipant(admin, round.id, organiser.userId);

    const response = await callUpdateWishes(round.id, organiser.accessToken, { wishes: "Books" });
    expect(response.status).toBe(200);
    expect(fake.sent).toHaveLength(0);
  });

  it("rejects wishes over the length limit", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await addParticipant(admin, round.id, organiser.userId);

    const response = await callUpdateWishes(round.id, organiser.accessToken, { wishes: "a".repeat(2001) });
    expect(response.status).toBe(400);
  });
});
