import { NextResponse } from "next/server";
import { performDraw } from "@/lib/draw-orchestration";
import { sendDrawCompletionEmails } from "@/lib/email/send-draw-emails";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAuthenticatedUser, getRequestScopedSupabaseClient } from "@/lib/supabase-request-client";

// A deliberate redraw: the round stays 'drawn', only current_draw_version
// moves forward (AC-DRAW-08). Separate from the initial draw endpoint on
// purpose — see its comment for why conflating "already drawn" with
// "therefore redraw" is the wrong call for a double-click of the original
// draw button. Concurrency uses the same claim-before-compute, WHERE-gated
// UPDATE pattern, keyed on current_draw_version instead of state.
export async function POST(
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
  if (round.state !== "drawn") {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }

  const previousVersion = round.current_draw_version ?? 0;
  const nextVersion = previousVersion + 1;

  const claim = await admin
    .from("rounds")
    .update({ current_draw_version: nextVersion })
    .eq("id", roundId)
    .eq("state", "drawn")
    .eq("current_draw_version", previousVersion)
    .select("current_draw_version");

  if (claim.error) {
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }

  if (!claim.data || claim.data.length === 0) {
    const { data: current } = await admin
      .from("rounds")
      .select("current_draw_version")
      .eq("id", roundId)
      .single();

    return NextResponse.json({ drawVersion: current?.current_draw_version, alreadyDrawn: true });
  }

  const outcome = await performDraw(admin, round, nextVersion);
  if (outcome.kind !== "drawn") {
    await admin.from("rounds").update({ current_draw_version: previousVersion }).eq("id", roundId);
    return NextResponse.json(outcome, { status: outcome.kind === "not_ready" ? 409 : 422 });
  }

  await sendDrawCompletionEmails(admin, {
    roundId,
    roundName: round.name,
    drawVersion: nextVersion,
    isRedraw: true,
  });

  return NextResponse.json({ drawVersion: nextVersion, alreadyDrawn: false });
}
