import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAuthenticatedUser, getRequestScopedSupabaseClient } from "@/lib/supabase-request-client";

// SPEC.md key screens: "My giftee | Participant | Giftee name, wishes,
// notes, budget, exchange date | None, read-only". SPEC.md "Viewing the
// result": "They never see who drew them" — this route only ever looks up
// the assignment where the caller is the *giver*, never one where they're
// the receiver, so there is no code path that could answer "who has me".
//
// Authorization is explicit here (admin client + manual checks tying
// every lookup back to the caller's own participant id) rather than
// relying on participants/users RLS, which doesn't grant a giver
// visibility into their giftee's profile row — only into their wishes
// (via the participant_wishes policy). Each step below re-derives the
// chain from the authenticated user, so a caller can only ever reach
// their own current-draw-version giftee.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: roundId } = await params;

  const requestClient = getRequestScopedSupabaseClient(request);
  const user = requestClient ? await getAuthenticatedUser(requestClient) : null;
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();

  const { data: myParticipant, error: participantError } = await admin
    .from("participants")
    .select("id")
    .eq("round_id", roundId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (participantError) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  if (!myParticipant) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: round, error: roundError } = await admin
    .from("rounds")
    .select("budget_amount, budget_currency, exchange_date, exchange_place, current_draw_version")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError || !round) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });

  const roundSummary = {
    budgetAmount: round.budget_amount,
    budgetCurrency: round.budget_currency,
    exchangeDate: round.exchange_date,
    exchangePlace: round.exchange_place,
  };

  if (!round.current_draw_version) {
    return NextResponse.json({ drawn: false, round: roundSummary });
  }

  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("receiver_id")
    .eq("round_id", roundId)
    .eq("giver_id", myParticipant.id)
    .eq("draw_version", round.current_draw_version)
    .maybeSingle();
  if (assignmentError) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  if (!assignment) {
    // Drawn, but this participant has no current assignment (e.g. removed
    // after the draw and not yet re-added to a fresh one).
    return NextResponse.json({ drawn: false, round: roundSummary });
  }

  const { data: receiverParticipant } = await admin
    .from("participants")
    .select("user_id")
    .eq("id", assignment.receiver_id)
    .single();

  const { data: receiverUser } = await admin
    .from("users")
    .select("display_name")
    .eq("id", receiverParticipant!.user_id)
    .single();

  const { data: wishes } = await admin
    .from("participant_wishes")
    .select("wishes, notes")
    .eq("participant_id", assignment.receiver_id)
    .maybeSingle();

  return NextResponse.json({
    drawn: true,
    round: roundSummary,
    giftee: {
      displayName: receiverUser?.display_name ?? null,
      wishes: wishes?.wishes ?? null,
      notes: wishes?.notes ?? null,
    },
  });
}
