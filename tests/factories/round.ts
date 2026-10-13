import type { SupabaseClient } from "@supabase/supabase-js";

export async function createRound(
  admin: SupabaseClient,
  options: { organiserId: string; organiserParticipates?: boolean; currentDrawVersion?: number },
) {
  const { data, error } = await admin
    .from("rounds")
    .insert({
      organiser_id: options.organiserId,
      name: "RLS spike round",
      signup_deadline: new Date(Date.now() + 86_400_000).toISOString(),
      organiser_participates: options.organiserParticipates ?? true,
      state: "drawn",
      current_draw_version: options.currentDrawVersion ?? 1,
    })
    .select()
    .single();
  if (error) throw new Error(`createRound: ${error.message}`);
  return data;
}

export async function addParticipant(admin: SupabaseClient, roundId: string, userId: string) {
  const { data, error } = await admin
    .from("participants")
    .insert({ round_id: roundId, user_id: userId })
    .select()
    .single();
  if (error) throw new Error(`addParticipant: ${error.message}`);
  return data;
}

export async function createAssignment(
  admin: SupabaseClient,
  options: { roundId: string; giverId: string; receiverId: string; drawVersion?: number },
) {
  const { data, error } = await admin
    .from("assignments")
    .insert({
      round_id: options.roundId,
      giver_id: options.giverId,
      receiver_id: options.receiverId,
      draw_version: options.drawVersion ?? 1,
    })
    .select()
    .single();
  if (error) throw new Error(`createAssignment: ${error.message}`);
  return data;
}

export async function setWishes(
  admin: SupabaseClient,
  options: { participantId: string; wishes: string },
) {
  const { error } = await admin
    .from("participant_wishes")
    .insert({ participant_id: options.participantId, wishes: options.wishes });
  if (error) throw new Error(`setWishes: ${error.message}`);
}
