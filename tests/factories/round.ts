import type { SupabaseClient } from "@supabase/supabase-js";

export async function createRound(
  admin: SupabaseClient,
  options: {
    organiserId: string;
    organiserParticipates?: boolean;
    currentDrawVersion?: number;
    state?: "draft" | "open" | "drawn" | "completed" | "archived" | "cancelled";
  },
) {
  const { data, error } = await admin
    .from("rounds")
    .insert({
      organiser_id: options.organiserId,
      name: "Test round",
      signup_deadline: new Date(Date.now() + 86_400_000).toISOString(),
      organiser_participates: options.organiserParticipates ?? true,
      state: options.state ?? "open",
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

export async function createInvitation(
  admin: SupabaseClient,
  options: {
    roundId: string;
    email?: string | null;
    expiresInMs?: number;
    revoked?: boolean;
  },
) {
  const now = Date.now();
  const { data, error } = await admin
    .from("invitations")
    .insert({
      round_id: options.roundId,
      email: options.email ?? null,
      token: `test-token-${crypto.randomUUID()}`,
      expires_at: new Date(now + (options.expiresInMs ?? 86_400_000)).toISOString(),
      revoked_at: options.revoked ? new Date(now).toISOString() : null,
    })
    .select()
    .single();
  if (error) throw new Error(`createInvitation: ${error.message}`);
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
