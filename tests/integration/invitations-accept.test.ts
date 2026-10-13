import { describe, expect, it } from "vitest";
import * as acceptRoute from "../../src/app/api/invitations/[token]/accept/route";
import { createAdminClient, createTestUser } from "../factories/supabase-clients";
import { createInvitation, createRound } from "../factories/round";

function callAccept(token: string, accessToken?: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return acceptRoute.POST(
    new Request(`http://localhost/api/invitations/${token}/accept`, {
      method: "POST",
      headers,
    }),
    { params: Promise.resolve({ token }) },
  );
}

describe("POST /api/invitations/[token]/accept", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await callAccept("whatever-token");
    expect(response.status).toBe(401);
  });

  it("[AC-INV-01] a link invite (no bound email) can be accepted by any signed-in user, directly", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const invitee = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId });
    const invitation = await createInvitation(admin, { roundId: round.id, email: null });

    const response = await callAccept(invitation.token, invitee.accessToken);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.roundId).toBe(round.id);

    const { data: participant } = await admin
      .from("participants")
      .select("*")
      .eq("round_id", round.id)
      .eq("user_id", invitee.userId)
      .single();
    expect(participant).not.toBeNull();
  });

  it("[AC-EDGE-01] accepting the same invite twice doesn't create a duplicate participant", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const invitee = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId });
    const invitation = await createInvitation(admin, { roundId: round.id, email: null });

    const first = await callAccept(invitation.token, invitee.accessToken);
    const firstBody = await first.json();
    const second = await callAccept(invitation.token, invitee.accessToken);
    const secondBody = await second.json();

    expect(second.status).toBe(200);
    expect(secondBody.participantId).toBe(firstBody.participantId);

    const { data: participants } = await admin
      .from("participants")
      .select("*")
      .eq("round_id", round.id)
      .eq("user_id", invitee.userId);
    expect(participants).toHaveLength(1);
  });

  it("an email invite can be accepted by the matching email", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId });
    const invitee = await createTestUser(admin, `bound-${Date.now()}@example.com`);
    const invitation = await createInvitation(admin, { roundId: round.id, email: invitee.email });

    const response = await callAccept(invitation.token, invitee.accessToken);
    expect(response.status).toBe(200);
  });

  it("[AC-INV-03] an email invite is rejected for a different signed-in email", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId });
    const outsider = await createTestUser(admin);
    const invitation = await createInvitation(admin, {
      roundId: round.id,
      email: "someone-else@example.com",
    });

    const response = await callAccept(invitation.token, outsider.accessToken);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("email_mismatch");
  });

  it("[AC-INV-02] a revoked invite cannot be used to join", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const invitee = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId });
    const invitation = await createInvitation(admin, { roundId: round.id, revoked: true });

    const response = await callAccept(invitation.token, invitee.accessToken);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("revoked");
  });

  it("[AC-INV-02] an expired invite cannot be used to join", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const invitee = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId });
    const invitation = await createInvitation(admin, { roundId: round.id, expiresInMs: -1000 });

    const response = await callAccept(invitation.token, invitee.accessToken);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("expired");
  });

  it("returns 404 for an unknown token", async () => {
    const admin = createAdminClient();
    const invitee = await createTestUser(admin);
    const response = await callAccept("does-not-exist", invitee.accessToken);
    expect(response.status).toBe(404);
  });
});
