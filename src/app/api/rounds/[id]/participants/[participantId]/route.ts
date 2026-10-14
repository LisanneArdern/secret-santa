import { NextResponse } from "next/server";
import { MINIMUM_PARTICIPANTS } from "@/domain/draw/draw";
import { canPerform, type RoundState } from "@/domain/round-lifecycle/state-machine";
import { performDraw } from "@/lib/draw-orchestration";
import { sendDrawCompletionEmails } from "@/lib/email/send-draw-emails";
import { sendEmailSafely } from "@/lib/email/send-safely";
import { removedFromRoundEmail } from "@/lib/email/templates";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAuthenticatedUser, getRequestScopedSupabaseClient } from "@/lib/supabase-request-client";

// Removing a participant (SPEC.md "Changes after the draw", AC-INV-06,
// AC-EDGE-02, AC-EDGE-12, AC-DRAW-09). Soft-deletes (status -> 'removed')
// rather than hard-deleting the row, consistent with Phase 2's schema
// decision to keep personal data until the 60-day archival job — but the
// exclusions referencing this participant ARE actually deleted, matching
// SPEC.md's edge case wording literally ("the exclusion is deleted
// together with the participant").
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; participantId: string }> },
) {
  const { id: roundId, participantId } = await params;

  const requestClient = getRequestScopedSupabaseClient(_request);
  const user = requestClient ? await getAuthenticatedUser(requestClient) : null;
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: round, error: roundError } = await admin
    .from("rounds")
    .select("id, name, organiser_id, state, current_draw_version, wishes_required")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  if (!round) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (round.organiser_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!canPerform(round.state as RoundState, "remove_participant")) {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }

  const { data: activeParticipants, error: participantsError } = await admin
    .from("participants")
    .select("id")
    .eq("round_id", roundId)
    .not("status", "in", "(declined,removed)");
  if (participantsError) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  const isActiveTarget = (activeParticipants ?? []).some((p) => p.id === participantId);
  if (!isActiveTarget) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // AC-EDGE-12: blocked if fewer than 3 people would remain after the draw
  // (the organiser can still cancel the whole round instead).
  const remainingCount = (activeParticipants ?? []).length - 1;
  if (round.state === "drawn" && remainingCount < MINIMUM_PARTICIPANTS) {
    return NextResponse.json(
      { error: "too_few_remaining", minimumRequired: MINIMUM_PARTICIPANTS },
      { status: 409 },
    );
  }

  const { data: removedParticipant, error: removeError } = await admin
    .from("participants")
    .update({ status: "removed" })
    .eq("id", participantId)
    .select("user_id")
    .single();
  if (removeError) return NextResponse.json({ error: "remove_failed" }, { status: 500 });

  // SPEC.md Notifications: "Removed from a round | The removed participant".
  const { data: removedUser } = await admin
    .from("users")
    .select("email")
    .eq("id", removedParticipant.user_id)
    .maybeSingle();
  if (removedUser?.email) {
    await sendEmailSafely({
      to: removedUser.email,
      ...removedFromRoundEmail({ roundName: round.name }),
    });
  }

  // AC-EDGE-02
  await admin
    .from("exclusions")
    .delete()
    .eq("round_id", roundId)
    .or(`giver_id.eq.${participantId},receiver_id.eq.${participantId}`);

  if (round.state !== "drawn") {
    return NextResponse.json({ ok: true, redrawn: false });
  }

  // AC-DRAW-09: removing a participant after the draw always triggers a
  // full redraw for all remaining participants.
  const nextVersion = (round.current_draw_version ?? 0) + 1;
  const outcome = await performDraw(admin, round, nextVersion);
  if (outcome.kind !== "drawn") {
    return NextResponse.json({ ok: true, redrawn: false, redrawFailed: outcome }, { status: 207 });
  }

  const { error: versionError } = await admin
    .from("rounds")
    .update({ current_draw_version: nextVersion })
    .eq("id", roundId);
  if (versionError) {
    return NextResponse.json({ error: "version_update_failed" }, { status: 500 });
  }

  await sendDrawCompletionEmails(admin, {
    roundId,
    roundName: round.name,
    drawVersion: nextVersion,
    isRedraw: true,
  });

  return NextResponse.json({ ok: true, redrawn: true, drawVersion: nextVersion });
}
