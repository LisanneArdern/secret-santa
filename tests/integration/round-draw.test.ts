import { describe, expect, it } from "vitest";
import * as drawRoute from "../../src/app/api/rounds/[id]/draw/route";
import * as redrawRoute from "../../src/app/api/rounds/[id]/redraw/route";
import { createAdminClient, createTestUser } from "../factories/supabase-clients";
import { addParticipant, createRound, setWishes } from "../factories/round";

function callDraw(roundId: string, accessToken?: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return drawRoute.POST(new Request(`http://localhost/api/rounds/${roundId}/draw`, { method: "POST", headers }), {
    params: Promise.resolve({ id: roundId }),
  });
}

function callRedraw(roundId: string, accessToken?: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return redrawRoute.POST(
    new Request(`http://localhost/api/rounds/${roundId}/redraw`, { method: "POST", headers }),
    { params: Promise.resolve({ id: roundId }) },
  );
}

async function setUpOpenRoundWithThree(admin: ReturnType<typeof createAdminClient>) {
  const organiser = await createTestUser(admin);
  const a = await createTestUser(admin);
  const b = await createTestUser(admin);
  const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
  await addParticipant(admin, round.id, organiser.userId);
  await addParticipant(admin, round.id, a.userId);
  await addParticipant(admin, round.id, b.userId);
  return { organiser, round };
}

describe("POST /api/rounds/[id]/draw", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await callDraw("whatever");
    expect(response.status).toBe(401);
  });

  it("rejects a non-organiser", async () => {
    const admin = createAdminClient();
    const { round } = await setUpOpenRoundWithThree(admin);
    const outsider = await createTestUser(admin);

    const response = await callDraw(round.id, outsider.accessToken);
    expect(response.status).toBe(403);
  });

  it("draws successfully with exactly 3 participants and flips state to drawn", async () => {
    const admin = createAdminClient();
    const { organiser, round } = await setUpOpenRoundWithThree(admin);

    const response = await callDraw(round.id, organiser.accessToken);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.drawVersion).toBe(1);
    expect(body.alreadyDrawn).toBe(false);

    const { data: updatedRound } = await admin.from("rounds").select("state, current_draw_version").eq("id", round.id).single();
    expect(updatedRound?.state).toBe("drawn");
    expect(updatedRound?.current_draw_version).toBe(1);

    const { data: assignments } = await admin.from("assignments").select("*").eq("round_id", round.id);
    expect(assignments).toHaveLength(3);
  });

  it("blocks with fewer than 3 participants", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await addParticipant(admin, round.id, organiser.userId);

    const response = await callDraw(round.id, organiser.accessToken);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.kind).toBe("too_few_participants");
  });

  it("blocks when wishes are required and someone isn't ready, naming them", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
    await admin.from("rounds").update({ wishes_required: true }).eq("id", round.id);
    const pOrganiser = await addParticipant(admin, round.id, organiser.userId);
    await addParticipant(admin, round.id, a.userId);
    const pB = await addParticipant(admin, round.id, b.userId);
    await setWishes(admin, { participantId: pOrganiser.id, wishes: "Books" });
    await setWishes(admin, { participantId: pB.id, wishes: "Socks" });

    const response = await callDraw(round.id, organiser.accessToken);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.kind).toBe("not_ready");

    const { data: roundAfter } = await admin.from("rounds").select("state").eq("id", round.id).single();
    expect(roundAfter?.state).toBe("open");
  });

  it("[AC-DRAW-04] reports blocking exclusions without drawing", async () => {
    const admin = createAdminClient();
    const { organiser, round } = await setUpOpenRoundWithThree(admin);
    const { data: participants } = await admin.from("participants").select("id").eq("round_id", round.id);
    const [p1, p2] = participants!;
    await admin.from("exclusions").insert([
      { round_id: round.id, giver_id: p1.id, receiver_id: p2.id },
      { round_id: round.id, giver_id: p1.id, receiver_id: participants![2].id },
    ]);

    const response = await callDraw(round.id, organiser.accessToken);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.kind).toBe("infeasible_exclusions");
    expect(body.blockingParticipantIds).toContain(p1.id);

    const { data: assignments } = await admin.from("assignments").select("*").eq("round_id", round.id);
    expect(assignments).toHaveLength(0);
  });

  it("[AC-EDGE-05] concurrent draw requests produce exactly one set of assignments", async () => {
    const admin = createAdminClient();
    const { organiser, round } = await setUpOpenRoundWithThree(admin);

    const [first, second] = await Promise.all([
      callDraw(round.id, organiser.accessToken),
      callDraw(round.id, organiser.accessToken),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 200]);
    const firstBody = await first.json();
    const secondBody = await second.json();
    // Exactly one of the two actually drew; the other saw "already drawn".
    expect([firstBody.alreadyDrawn, secondBody.alreadyDrawn].sort()).toEqual([false, true]);
    expect(firstBody.drawVersion).toBe(secondBody.drawVersion);

    const { data: assignments } = await admin.from("assignments").select("*").eq("round_id", round.id);
    expect(assignments).toHaveLength(3);

    const { data: updatedRound } = await admin
      .from("rounds")
      .select("current_draw_version")
      .eq("id", round.id)
      .single();
    expect(updatedRound?.current_draw_version).toBe(1);
  });

  it("a second call to /draw after it's already drawn returns the existing result, not a new redraw", async () => {
    const admin = createAdminClient();
    const { organiser, round } = await setUpOpenRoundWithThree(admin);

    const first = await callDraw(round.id, organiser.accessToken);
    expect((await first.json()).drawVersion).toBe(1);

    const second = await callDraw(round.id, organiser.accessToken);
    const secondBody = await second.json();
    expect(secondBody.alreadyDrawn).toBe(true);
    expect(secondBody.drawVersion).toBe(1);

    const { data: assignments } = await admin.from("assignments").select("*").eq("round_id", round.id);
    expect(assignments).toHaveLength(3);
  });

  it("[AC-DRAW-08] a redraw increments drawVersion and the giver only ever sees the latest", async () => {
    const admin = createAdminClient();
    const { organiser, round } = await setUpOpenRoundWithThree(admin);

    const first = await callDraw(round.id, organiser.accessToken);
    expect((await first.clone().json()).drawVersion).toBe(1);

    const second = await callRedraw(round.id, organiser.accessToken);
    const secondBody = await second.json();
    expect(secondBody.drawVersion).toBe(2);
    expect(secondBody.alreadyDrawn).toBe(false);

    const { data: v1Assignments } = await admin
      .from("assignments")
      .select("*")
      .eq("round_id", round.id)
      .eq("draw_version", 1);
    expect(v1Assignments).toHaveLength(3);

    const { data: v2Assignments } = await admin
      .from("assignments")
      .select("*")
      .eq("round_id", round.id)
      .eq("draw_version", 2);
    expect(v2Assignments).toHaveLength(3);

    const organiserParticipant = await admin
      .from("participants")
      .select("id")
      .eq("round_id", round.id)
      .eq("user_id", organiser.userId)
      .single();

    const giverView = await organiser.client
      .from("assignments")
      .select("*")
      .eq("round_id", round.id)
      .eq("giver_id", organiserParticipant.data!.id);
    expect(giverView.data).toHaveLength(1);
    expect(giverView.data?.[0].draw_version).toBe(2);
  });

  it("[AC-EDGE-05] concurrent redraw requests also produce exactly one result", async () => {
    const admin = createAdminClient();
    const { organiser, round } = await setUpOpenRoundWithThree(admin);
    await callDraw(round.id, organiser.accessToken);

    const [first, second] = await Promise.all([
      callRedraw(round.id, organiser.accessToken),
      callRedraw(round.id, organiser.accessToken),
    ]);

    const firstBody = await first.json();
    const secondBody = await second.json();
    expect([firstBody.alreadyDrawn, secondBody.alreadyDrawn].sort()).toEqual([false, true]);
    expect(firstBody.drawVersion).toBe(secondBody.drawVersion);
    expect(firstBody.drawVersion).toBe(2);

    const { data: assignments } = await admin
      .from("assignments")
      .select("*")
      .eq("round_id", round.id)
      .eq("draw_version", 2);
    expect(assignments).toHaveLength(3);
  });
});
