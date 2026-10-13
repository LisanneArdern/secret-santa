import { describe, expect, it } from "vitest";
import * as settingsRoute from "../../src/app/api/rounds/[id]/route";
import * as drawRoute from "../../src/app/api/rounds/[id]/draw/route";
import { createAdminClient, createTestUser } from "../factories/supabase-clients";
import { addParticipant, createRound } from "../factories/round";

function callPatch(roundId: string, body: unknown, accessToken?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return settingsRoute.PATCH(
    new Request(`http://localhost/api/rounds/${roundId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: roundId }) },
  );
}

function callDraw(roundId: string, accessToken?: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return drawRoute.POST(new Request(`http://localhost/api/rounds/${roundId}/draw`, { method: "POST", headers }), {
    params: Promise.resolve({ id: roundId }),
  });
}

describe("PATCH /api/rounds/[id]", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await callPatch("whatever", { name: "New name" });
    expect(response.status).toBe(401);
  });

  it("lets the organiser edit settings while open", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });

    const response = await callPatch(round.id, { name: "Updated name" }, organiser.accessToken);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.round.name).toBe("Updated name");
  });

  it("rejects a non-organiser's edit", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const outsider = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });

    const response = await callPatch(round.id, { name: "Hijacked" }, outsider.accessToken);
    expect(response.status).toBe(403);
  });

  it("rejects an invalid signup-deadline/exchange-date combination", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });

    const response = await callPatch(
      round.id,
      {
        signup_deadline: new Date(Date.now() + 10_000_000).toISOString(),
        exchange_date: new Date(Date.now() + 1_000_000).toISOString(),
      },
      organiser.accessToken,
    );
    expect(response.status).toBe(400);
  });

  it("[AC-LIFE-01] rejects settings edits once the round has been drawn", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "drawn" });
    await addParticipant(admin, round.id, organiser.userId);
    await addParticipant(admin, round.id, a.userId);
    await addParticipant(admin, round.id, b.userId);

    const response = await callPatch(round.id, { name: "Too late" }, organiser.accessToken);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("draw_already_started");
  });

  it("[AC-EDGE-06] a settings edit racing a draw loses once the draw commits first", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await addParticipant(admin, round.id, organiser.userId);
    await addParticipant(admin, round.id, a.userId);
    await addParticipant(admin, round.id, b.userId);

    const drawResponse = await callDraw(round.id, organiser.accessToken);
    expect(drawResponse.status).toBe(200);

    const editResponse = await callPatch(round.id, { name: "Too slow" }, organiser.accessToken);
    expect(editResponse.status).toBe(409);
  });
});
