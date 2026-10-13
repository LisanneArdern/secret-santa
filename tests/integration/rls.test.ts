import { describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "../factories/supabase-clients";
import { addParticipant, createAssignment, createRound, setWishes } from "../factories/round";

// Phase 2 spike (ROADMAP.md): proves the local Supabase CLI + Vitest
// integration-test loop works end to end, and closes the RLS-dependent
// privacy criteria against the real database policies — not mocks.
describe("row-level security", () => {
  it("[AC-PRIV-01,03] a giver sees only their own current assignment; the receiver can't see who gave to them; an outsider sees nothing", async () => {
    const admin = createAdminClient();
    const giver = await createTestUser(admin);
    const receiver = await createTestUser(admin);
    const outsider = await createTestUser(admin);

    const round = await createRound(admin, { organiserId: giver.userId });
    const giverParticipant = await addParticipant(admin, round.id, giver.userId);
    const receiverParticipant = await addParticipant(admin, round.id, receiver.userId);
    await addParticipant(admin, round.id, outsider.userId);
    await createAssignment(admin, {
      roundId: round.id,
      giverId: giverParticipant.id,
      receiverId: receiverParticipant.id,
    });

    const giverView = await giver.client
      .from("assignments")
      .select("*")
      .eq("round_id", round.id);
    expect(giverView.error).toBeNull();
    expect(giverView.data).toHaveLength(1);
    expect(giverView.data?.[0].receiver_id).toBe(receiverParticipant.id);

    // The receiver querying by their own receiver_id must not learn who
    // their giver is — the policy only grants visibility via giver_id.
    const receiverView = await receiver.client
      .from("assignments")
      .select("*")
      .eq("round_id", round.id);
    expect(receiverView.data).toHaveLength(0);

    const outsiderView = await outsider.client
      .from("assignments")
      .select("*")
      .eq("round_id", round.id);
    expect(outsiderView.data).toHaveLength(0);
  });

  it("[AC-PRIV-02] a participating organiser sees only their own assignment, same as anyone else", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const other = await createTestUser(admin);

    const round = await createRound(admin, {
      organiserId: organiser.userId,
      organiserParticipates: true,
    });
    const organiserParticipant = await addParticipant(admin, round.id, organiser.userId);
    const otherParticipant = await addParticipant(admin, round.id, other.userId);

    // organiser gives to other, and other gives to organiser.
    await createAssignment(admin, {
      roundId: round.id,
      giverId: organiserParticipant.id,
      receiverId: otherParticipant.id,
    });
    await createAssignment(admin, {
      roundId: round.id,
      giverId: otherParticipant.id,
      receiverId: organiserParticipant.id,
    });

    const organiserView = await organiser.client
      .from("assignments")
      .select("*")
      .eq("round_id", round.id);

    expect(organiserView.data).toHaveLength(1);
    expect(organiserView.data?.[0].giver_id).toBe(organiserParticipant.id);
  });

  it("a non-participating organiser can see every assignment in their round", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);

    const round = await createRound(admin, {
      organiserId: organiser.userId,
      organiserParticipates: false,
    });
    const participantA = await addParticipant(admin, round.id, a.userId);
    const participantB = await addParticipant(admin, round.id, b.userId);
    await createAssignment(admin, {
      roundId: round.id,
      giverId: participantA.id,
      receiverId: participantB.id,
    });
    await createAssignment(admin, {
      roundId: round.id,
      giverId: participantB.id,
      receiverId: participantA.id,
    });

    const organiserView = await organiser.client
      .from("assignments")
      .select("*")
      .eq("round_id", round.id);

    expect(organiserView.data).toHaveLength(2);
  });

  it("[AC-DRAW-08] only the current draw version's assignment is visible, even to the correct giver", async () => {
    const admin = createAdminClient();
    const giver = await createTestUser(admin);
    const receiver = await createTestUser(admin);

    const round = await createRound(admin, { organiserId: giver.userId, currentDrawVersion: 2 });
    const giverParticipant = await addParticipant(admin, round.id, giver.userId);
    const receiverParticipant = await addParticipant(admin, round.id, receiver.userId);

    // Stale version from before a redraw — must stay invisible.
    await createAssignment(admin, {
      roundId: round.id,
      giverId: giverParticipant.id,
      receiverId: receiverParticipant.id,
      drawVersion: 1,
    });
    const currentAssignment = await createAssignment(admin, {
      roundId: round.id,
      giverId: giverParticipant.id,
      receiverId: receiverParticipant.id,
      drawVersion: 2,
    });

    const giverView = await giver.client.from("assignments").select("*").eq("round_id", round.id);
    expect(giverView.data).toHaveLength(1);
    expect(giverView.data?.[0].id).toBe(currentAssignment.id);
  });

  it("[AC-PRIV-04] wishes are visible to their owner and their current giver, nobody else", async () => {
    const admin = createAdminClient();
    const giver = await createTestUser(admin);
    const owner = await createTestUser(admin);
    const outsider = await createTestUser(admin);

    const round = await createRound(admin, { organiserId: giver.userId });
    const giverParticipant = await addParticipant(admin, round.id, giver.userId);
    const ownerParticipant = await addParticipant(admin, round.id, owner.userId);
    await addParticipant(admin, round.id, outsider.userId);
    await createAssignment(admin, {
      roundId: round.id,
      giverId: giverParticipant.id,
      receiverId: ownerParticipant.id,
    });
    await setWishes(admin, { participantId: ownerParticipant.id, wishes: "Warm socks" });

    const ownView = await owner.client
      .from("participant_wishes")
      .select("*")
      .eq("participant_id", ownerParticipant.id);
    expect(ownView.data).toHaveLength(1);
    expect(ownView.data?.[0].wishes).toBe("Warm socks");

    const giverViewOfWishes = await giver.client
      .from("participant_wishes")
      .select("*")
      .eq("participant_id", ownerParticipant.id);
    expect(giverViewOfWishes.data).toHaveLength(1);

    const outsiderViewOfWishes = await outsider.client
      .from("participant_wishes")
      .select("*")
      .eq("participant_id", ownerParticipant.id);
    expect(outsiderViewOfWishes.data).toHaveLength(0);
  });

  it("[AC-EDGE-11] a user who is a giver in two rounds only sees each round's own giftee", async () => {
    const admin = createAdminClient();
    const user = await createTestUser(admin);
    const giftee1Owner = await createTestUser(admin);
    const giftee2Owner = await createTestUser(admin);

    const roundA = await createRound(admin, { organiserId: user.userId });
    const roundB = await createRound(admin, { organiserId: user.userId });

    const userInA = await addParticipant(admin, roundA.id, user.userId);
    const giftee1 = await addParticipant(admin, roundA.id, giftee1Owner.userId);
    await createAssignment(admin, { roundId: roundA.id, giverId: userInA.id, receiverId: giftee1.id });

    const userInB = await addParticipant(admin, roundB.id, user.userId);
    const giftee2 = await addParticipant(admin, roundB.id, giftee2Owner.userId);
    await createAssignment(admin, { roundId: roundB.id, giverId: userInB.id, receiverId: giftee2.id });

    const viewOfA = await user.client.from("assignments").select("*").eq("round_id", roundA.id);
    expect(viewOfA.data).toHaveLength(1);
    expect(viewOfA.data?.[0].receiver_id).toBe(giftee1.id);

    const viewOfB = await user.client.from("assignments").select("*").eq("round_id", roundB.id);
    expect(viewOfB.data).toHaveLength(1);
    expect(viewOfB.data?.[0].receiver_id).toBe(giftee2.id);
  });
});
