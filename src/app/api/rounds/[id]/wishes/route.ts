import { NextResponse } from "next/server";
import { MAX_WISHES_LENGTH, validateWishesLength } from "@/domain/validation/wishes";
import { sendEmailSafely } from "@/lib/email/send-safely";
import { baseUrl, wishesUpdatedEmail } from "@/lib/email/templates";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAuthenticatedUser, getRequestScopedSupabaseClient } from "@/lib/supabase-request-client";

// A participant adding/editing their own wishes and notes (SPEC.md
// "Participation"). Self-only: the write goes through the caller's own
// request-scoped client, so participant_wishes' RLS policy (owner only)
// is the actual access check, not a manual one here.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: roundId } = await params;

  const requestClient = getRequestScopedSupabaseClient(request);
  const user = requestClient ? await getAuthenticatedUser(requestClient) : null;
  if (!requestClient || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { wishes?: string | null; notes?: string | null }
    | null;
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const wishes = typeof body.wishes === "string" ? body.wishes : null;
  const notes = typeof body.notes === "string" ? body.notes : null;

  for (const field of [wishes, notes]) {
    if (!field) continue;
    const check = validateWishesLength(field);
    if (!check.ok) {
      return NextResponse.json({ error: "too_long", maxLength: MAX_WISHES_LENGTH }, { status: 400 });
    }
  }

  const { data: myParticipant, error: participantError } = await requestClient
    .from("participants")
    .select("id")
    .eq("round_id", roundId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (participantError) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  if (!myParticipant) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error: upsertError } = await requestClient
    .from("participant_wishes")
    .upsert({ participant_id: myParticipant.id, wishes, notes }, { onConflict: "participant_id" });
  if (upsertError) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await notifyCurrentGiverOfWishesUpdate({ roundId, gifteeParticipantId: myParticipant.id, gifteeUserId: user.id });

  return NextResponse.json({ ok: true });
}

// SPEC.md Notifications: "Giftee updated their wishes | That giftee's
// giver" (AC-NOTIF-02). Only fires when the round has actually been
// drawn — editing wishes before the draw has nobody to notify yet.
async function notifyCurrentGiverOfWishesUpdate(options: {
  roundId: string;
  gifteeParticipantId: string;
  gifteeUserId: string;
}): Promise<void> {
  const admin = getSupabaseAdminClient();

  const { data: round } = await admin
    .from("rounds")
    .select("name, current_draw_version")
    .eq("id", options.roundId)
    .maybeSingle();
  if (!round?.current_draw_version) return;

  const { data: assignment } = await admin
    .from("assignments")
    .select("giver_id")
    .eq("round_id", options.roundId)
    .eq("receiver_id", options.gifteeParticipantId)
    .eq("draw_version", round.current_draw_version)
    .maybeSingle();
  if (!assignment) return;

  const { data: giverParticipant } = await admin
    .from("participants")
    .select("user_id")
    .eq("id", assignment.giver_id)
    .single();
  const { data: giverUser } = await admin
    .from("users")
    .select("email")
    .eq("id", giverParticipant!.user_id)
    .single();
  if (!giverUser?.email) return;

  const { data: gifteeUser } = await admin
    .from("users")
    .select("display_name")
    .eq("id", options.gifteeUserId)
    .maybeSingle();

  await sendEmailSafely({
    to: giverUser.email,
    ...wishesUpdatedEmail({
      roundName: round.name,
      gifteeName: gifteeUser?.display_name ?? "Your giftee",
      roundUrl: `${baseUrl()}/rounds/${options.roundId}`,
    }),
  });
}
