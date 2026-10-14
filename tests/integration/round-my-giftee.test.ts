import { describe, expect, it } from "vitest";
import * as myGifteeRoute from "../../src/app/api/rounds/[id]/my-giftee/route";
import * as drawRoute from "../../src/app/api/rounds/[id]/draw/route";
import { createAdminClient, createTestUser } from "../factories/supabase-clients";
import { addParticipant, createRound, setWishes } from "../factories/round";

function callMyGiftee(roundId: string, accessToken?: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return myGifteeRoute.GET(new Request(`http://localhost/api/rounds/${roundId}/my-giftee`, { headers }), {
    params: Promise.resolve({ id: roundId }),
  });
}

function callDraw(roundId: string, accessToken?: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return drawRoute.POST(new Request(`http://localhost/api/rounds/${roundId}/draw`, { method: "POST", headers }), {
    params: Promise.resolve({ id: roundId }),
  });
}

describe("GET /api/rounds/[id]/my-giftee", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await callMyGiftee("whatever");
    expect(response.status).toBe(401);
  });

  it("returns 404 for someone who isn't a participant", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const outsider = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });

    const response = await callMyGiftee(round.id, outsider.accessToken);
    expect(response.status).toBe(404);
  });

  it("reports not drawn yet before the draw happens", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const round = await createRound(admin, {
      organiserId: organiser.userId,
      state: "open",
      currentDrawVersion: null,
    });
    await addParticipant(admin, round.id, organiser.userId);

    const response = await callMyGiftee(round.id, organiser.accessToken);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.drawn).toBe(false);
  });

  it("[AC-PRIV-01,03] shows a participant only their own giftee's name, wishes and notes", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);
    const round = await createRound(admin, {
      organiserId: organiser.userId,
      state: "open",
      currentDrawVersion: null,
    });
    await admin.from("rounds").update({ exchange_place: "Grandma's house" }).eq("id", round.id);
    await addParticipant(admin, round.id, organiser.userId);
    const participantA = await addParticipant(admin, round.id, a.userId);
    const participantB = await addParticipant(admin, round.id, b.userId);
    await admin.from("users").update({ display_name: "Bob" }).eq("id", b.userId);
    await setWishes(admin, { participantId: participantB.id, wishes: "Warm socks" });

    await callDraw(round.id, organiser.accessToken);

    // Find out who gives to whom so we can assert on the actual giver.
    const { data: assignments } = await admin.from("assignments").select("*").eq("round_id", round.id);
    const forA = assignments!.find((x) => x.giver_id === participantA.id)!;

    const response = await callMyGiftee(round.id, a.accessToken);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.drawn).toBe(true);
    expect(body.round.exchangePlace).toBe("Grandma's house");

    if (forA.receiver_id === participantB.id) {
      expect(body.giftee.displayName).toBe("Bob");
      expect(body.giftee.wishes).toBe("Warm socks");
    } else {
      // a gives to the organiser instead; just assert the shape is sane
      // and definitely not leaking b's wishes to the wrong giver.
      expect(body.giftee.wishes).not.toBe("Warm socks");
    }
  });

  it("[AC-PRIV-03] the response never names or implies who the caller's own giver is", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);
    const round = await createRound(admin, {
      organiserId: organiser.userId,
      state: "open",
      currentDrawVersion: null,
    });
    await addParticipant(admin, round.id, organiser.userId);
    await addParticipant(admin, round.id, a.userId);
    await addParticipant(admin, round.id, b.userId);

    await callDraw(round.id, organiser.accessToken);

    const response = await callMyGiftee(round.id, a.accessToken);
    const body = await response.json();

    // The only person-identifying field in the response is the giftee's
    // name — there is no giver/sender field at all for a client to read.
    expect(Object.keys(body.giftee).sort()).toEqual(["displayName", "notes", "wishes"]);
  });
});
