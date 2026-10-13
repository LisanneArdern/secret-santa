import { describe, expect, it } from "vitest";
import * as invitationsRoute from "../../src/app/api/rounds/[id]/invitations/route";
import { createAdminClient, createTestUser } from "../factories/supabase-clients";
import { createRound } from "../factories/round";

function callCreateInvitation(roundId: string, body: unknown, accessToken?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return invitationsRoute.POST(
    new Request(`http://localhost/api/rounds/${roundId}/invitations`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: roundId }) },
  );
}

function callListInvitations(roundId: string, accessToken?: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return invitationsRoute.GET(new Request(`http://localhost/api/rounds/${roundId}/invitations`, { headers }), {
    params: Promise.resolve({ id: roundId }),
  });
}

describe("POST /api/rounds/[id]/invitations", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await callCreateInvitation("whatever", {});
    expect(response.status).toBe(401);
  });

  it("rejects a non-organiser", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const outsider = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });

    const response = await callCreateInvitation(round.id, { email: "a@example.com" }, outsider.accessToken);
    expect(response.status).toBe(403);
  });

  it("creates an email invite", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });

    const response = await callCreateInvitation(round.id, { email: "friend@example.com" }, organiser.accessToken);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.invitation.email).toBe("friend@example.com");
    expect(body.invitation.token).toBeTruthy();
    expect(body.invitation.expires_at).toBe(round.signup_deadline);
  });

  it("creates a link invite when no email is given", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });

    const response = await callCreateInvitation(round.id, {}, organiser.accessToken);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.invitation.email).toBeNull();
  });

  it("[AC-EDGE] rejects a second invite to an already-invited email", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });

    const first = await callCreateInvitation(round.id, { email: "friend@example.com" }, organiser.accessToken);
    expect(first.status).toBe(201);

    const second = await callCreateInvitation(round.id, { email: "friend@example.com" }, organiser.accessToken);
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toBe("already_invited");
  });

  it("rejects inviting once the round is no longer open", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "drawn" });

    const response = await callCreateInvitation(round.id, { email: "late@example.com" }, organiser.accessToken);
    expect(response.status).toBe(409);
  });
});

describe("GET /api/rounds/[id]/invitations", () => {
  it("lists invitations for the organiser", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await callCreateInvitation(round.id, { email: "a@example.com" }, organiser.accessToken);
    await callCreateInvitation(round.id, { email: "b@example.com" }, organiser.accessToken);

    const response = await callListInvitations(round.id, organiser.accessToken);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invitations).toHaveLength(2);
  });

  it("[AC-INV-05 adjacent] a non-organiser sees no invitations via RLS", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const outsider = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await callCreateInvitation(round.id, { email: "a@example.com" }, organiser.accessToken);

    const response = await callListInvitations(round.id, outsider.accessToken);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invitations).toHaveLength(0);
  });
});
