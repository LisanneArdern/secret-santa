import { describe, expect, it } from "vitest";
import * as drawRoute from "../../src/app/api/rounds/[id]/draw/route";
import * as removeRoute from "../../src/app/api/rounds/[id]/participants/[participantId]/route";
import { createAdminClient, createTestUser } from "../factories/supabase-clients";
import { addParticipant, createRound } from "../factories/round";

function callDraw(roundId: string, accessToken?: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return drawRoute.POST(new Request(`http://localhost/api/rounds/${roundId}/draw`, { method: "POST", headers }), {
    params: Promise.resolve({ id: roundId }),
  });
}

function callRemove(roundId: string, participantId: string, accessToken?: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return removeRoute.DELETE(
    new Request(`http://localhost/api/rounds/${roundId}/participants/${participantId}`, {
      method: "DELETE",
      headers,
    }),
    { params: Promise.resolve({ id: roundId, participantId }) },
  );
}

describe("DELETE /api/rounds/[id]/participants/[participantId]", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await callRemove("round", "participant");
    expect(response.status).toBe(401);
  });

  it("rejects a non-organiser", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const outsider = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    const participantA = await addParticipant(admin, round.id, a.userId);

    const response = await callRemove(round.id, participantA.id, outsider.accessToken);
    expect(response.status).toBe(403);
  });

  it("removes a participant before the draw with no redraw", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await addParticipant(admin, round.id, organiser.userId);
    const participantA = await addParticipant(admin, round.id, a.userId);

    const response = await callRemove(round.id, participantA.id, organiser.accessToken);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.redrawn).toBe(false);

    const { data: participant } = await admin.from("participants").select("status").eq("id", participantA.id).single();
    expect(participant?.status).toBe("removed");
  });

  it("[AC-EDGE-02] deletes exclusions referencing the removed participant", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    const pOrg = await addParticipant(admin, round.id, organiser.userId);
    const pA = await addParticipant(admin, round.id, a.userId);
    const pB = await addParticipant(admin, round.id, b.userId);
    await admin.from("exclusions").insert([
      { round_id: round.id, giver_id: pA.id, receiver_id: pOrg.id },
      { round_id: round.id, giver_id: pOrg.id, receiver_id: pA.id },
      { round_id: round.id, giver_id: pOrg.id, receiver_id: pB.id },
    ]);

    await callRemove(round.id, pA.id, organiser.accessToken);

    const { data: remainingExclusions } = await admin.from("exclusions").select("*").eq("round_id", round.id);
    expect(remainingExclusions).toHaveLength(1);
    expect(remainingExclusions?.[0].giver_id).toBe(pOrg.id);
    expect(remainingExclusions?.[0].receiver_id).toBe(pB.id);
  });

  it("[AC-DRAW-09] removing a participant after the draw triggers a full redraw for everyone remaining", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);
    const c = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await addParticipant(admin, round.id, organiser.userId);
    await addParticipant(admin, round.id, a.userId);
    const pB = await addParticipant(admin, round.id, b.userId);
    await addParticipant(admin, round.id, c.userId);

    const drawResponse = await callDraw(round.id, organiser.accessToken);
    expect((await drawResponse.json()).drawVersion).toBe(1);

    const removeResponse = await callRemove(round.id, pB.id, organiser.accessToken);
    expect(removeResponse.status).toBe(200);
    const removeBody = await removeResponse.json();
    expect(removeBody.redrawn).toBe(true);
    expect(removeBody.drawVersion).toBe(2);

    const { data: v2Assignments } = await admin
      .from("assignments")
      .select("*")
      .eq("round_id", round.id)
      .eq("draw_version", 2);
    // 3 remaining participants (organiser, a, c) — b was removed.
    expect(v2Assignments).toHaveLength(3);
    expect(v2Assignments?.some((x) => x.giver_id === pB.id || x.receiver_id === pB.id)).toBe(false);

    const { data: round2 } = await admin.from("rounds").select("current_draw_version").eq("id", round.id).single();
    expect(round2?.current_draw_version).toBe(2);
  });

  it("[AC-EDGE-12] blocks removal after the draw if fewer than 3 would remain", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await addParticipant(admin, round.id, organiser.userId);
    await addParticipant(admin, round.id, a.userId);
    const pB = await addParticipant(admin, round.id, b.userId);

    await callDraw(round.id, organiser.accessToken);

    const response = await callRemove(round.id, pB.id, organiser.accessToken);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("too_few_remaining");

    const { data: participant } = await admin.from("participants").select("status").eq("id", pB.id).single();
    expect(participant?.status).not.toBe("removed");
  });

  it("returns 404 for a participant that isn't active in this round", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });

    const response = await callRemove(round.id, crypto.randomUUID(), organiser.accessToken);
    expect(response.status).toBe(404);
  });
});
