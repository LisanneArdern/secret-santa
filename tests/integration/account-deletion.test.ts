import { describe, expect, it } from "vitest";
import * as accountRoute from "../../src/app/api/account/route";
import { createAdminClient, createTestUser } from "../factories/supabase-clients";
import { createRound } from "../factories/round";

function callDelete(accessToken?: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return accountRoute.DELETE(new Request("http://localhost/api/account", { method: "DELETE", headers }));
}

describe("DELETE /api/account", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await callDelete();
    expect(response.status).toBe(401);
  });

  it("allows deletion with no organised rounds", async () => {
    const admin = createAdminClient();
    const user = await createTestUser(admin);

    const response = await callDelete(user.accessToken);
    expect(response.status).toBe(200);

    const { data } = await admin.auth.admin.getUserById(user.userId);
    expect(data.user).toBeNull();
  });

  it("[AC-EDGE-10] blocks deletion while organising an open round", async () => {
    const admin = createAdminClient();
    const user = await createTestUser(admin);
    await createRound(admin, { organiserId: user.userId, state: "open" });

    const response = await callDelete(user.accessToken);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("has_open_or_drawn_round");

    const { data } = await admin.auth.admin.getUserById(user.userId);
    expect(data.user).not.toBeNull();
  });

  it("[AC-EDGE-10] blocks deletion while organising a drawn round, allows it once cancelled", async () => {
    const admin = createAdminClient();
    const user = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: user.userId, state: "drawn" });

    const blocked = await callDelete(user.accessToken);
    expect(blocked.status).toBe(409);

    await admin.from("rounds").update({ state: "cancelled" }).eq("id", round.id);

    const allowed = await callDelete(user.accessToken);
    expect(allowed.status).toBe(200);
  });
});
