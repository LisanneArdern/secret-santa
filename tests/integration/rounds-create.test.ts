import { describe, expect, it } from "vitest";
import * as createRoute from "../../src/app/api/rounds/route";
import * as detailRoute from "../../src/app/api/rounds/[id]/route";
import { createAdminClient, createTestUser } from "../factories/supabase-clients";
import { createRound } from "../factories/round";

function callCreate(body: unknown, accessToken?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return createRoute.POST(
    new Request("http://localhost/api/rounds", { method: "POST", headers, body: JSON.stringify(body) }),
  );
}

function callGet(roundId: string, accessToken?: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return detailRoute.GET(new Request(`http://localhost/api/rounds/${roundId}`, { headers }), {
    params: Promise.resolve({ id: roundId }),
  });
}

describe("POST /api/rounds", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await callCreate({ name: "Christmas" });
    expect(response.status).toBe(401);
  });

  it("rejects a missing name", async () => {
    const admin = createAdminClient();
    const user = await createTestUser(admin);
    const response = await callCreate(
      { signup_deadline: new Date(Date.now() + 86_400_000).toISOString() },
      user.accessToken,
    );
    expect(response.status).toBe(400);
  });

  it("rejects an invalid date combination", async () => {
    const admin = createAdminClient();
    const user = await createTestUser(admin);
    const response = await callCreate(
      {
        name: "Christmas",
        signup_deadline: new Date(Date.now() - 1000).toISOString(),
      },
      user.accessToken,
    );
    expect(response.status).toBe(400);
  });

  it("creates a round in the open state with the caller as organiser", async () => {
    const admin = createAdminClient();
    const user = await createTestUser(admin);
    const response = await callCreate(
      {
        name: "Family Christmas",
        budget_amount: "20.00",
        budget_currency: "GBP",
        signup_deadline: new Date(Date.now() + 86_400_000).toISOString(),
        wishes_required: true,
        organiser_participates: false,
      },
      user.accessToken,
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.round.name).toBe("Family Christmas");
    expect(body.round.state).toBe("open");
    expect(body.round.organiser_id).toBe(user.userId);
    expect(body.round.wishes_required).toBe(true);
    expect(body.round.organiser_participates).toBe(false);

    const { data: dbRound } = await admin.from("rounds").select("*").eq("id", body.round.id).single();
    expect(dbRound?.organiser_id).toBe(user.userId);
  });
});

describe("GET /api/rounds/[id]", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await callGet("whatever");
    expect(response.status).toBe(401);
  });

  it("lets the organiser read their own round", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });

    const response = await callGet(round.id, organiser.accessToken);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.round.id).toBe(round.id);
    expect(body.isOrganiser).toBe(true);
  });

  it("[AC-PRIV] an outsider cannot read a round they aren't part of", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const outsider = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });

    const response = await callGet(round.id, outsider.accessToken);
    expect(response.status).toBe(404);
  });
});
