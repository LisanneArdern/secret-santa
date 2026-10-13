import { describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "../factories/supabase-clients";
import { addParticipant, createRound } from "../factories/round";

// AC-INV-05: only the organiser can create, edit or delete exclusions.
describe("exclusions row-level security", () => {
  it("lets the organiser create and read an exclusion", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId });
    const participantA = await addParticipant(admin, round.id, a.userId);
    const participantB = await addParticipant(admin, round.id, b.userId);

    const insertResult = await organiser.client
      .from("exclusions")
      .insert({ round_id: round.id, giver_id: participantA.id, receiver_id: participantB.id })
      .select();
    expect(insertResult.error).toBeNull();
    expect(insertResult.data).toHaveLength(1);

    const selectResult = await organiser.client
      .from("exclusions")
      .select("*")
      .eq("round_id", round.id);
    expect(selectResult.data).toHaveLength(1);
  });

  it("[AC-INV-05] a participant cannot create, read, or delete an exclusion", async () => {
    const admin = createAdminClient();
    const organiser = await createTestUser(admin);
    const a = await createTestUser(admin);
    const b = await createTestUser(admin);
    const round = await createRound(admin, { organiserId: organiser.userId });
    const participantA = await addParticipant(admin, round.id, a.userId);
    const participantB = await addParticipant(admin, round.id, b.userId);

    const insertAttempt = await a.client
      .from("exclusions")
      .insert({ round_id: round.id, giver_id: participantA.id, receiver_id: participantB.id })
      .select();
    // RLS rejects the insert outright (a `with check` failure), rather than
    // silently accepting it and then hiding the row on read.
    expect(insertAttempt.error).not.toBeNull();
    expect(insertAttempt.data).toBeNull();

    const existing = await admin
      .from("exclusions")
      .insert({ round_id: round.id, giver_id: participantA.id, receiver_id: participantB.id })
      .select()
      .single();

    const selectAttempt = await a.client.from("exclusions").select("*").eq("round_id", round.id);
    expect(selectAttempt.data).toHaveLength(0);

    await a.client.from("exclusions").delete().eq("id", existing.data!.id);
    const { data: stillThere } = await admin
      .from("exclusions")
      .select("*")
      .eq("id", existing.data!.id);
    expect(stillThere).toHaveLength(1);
  });
});
