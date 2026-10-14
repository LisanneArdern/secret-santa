import { NextResponse } from "next/server";
import {
  claimNextDrawVersion,
  performDraw,
  revertDrawVersionClaim,
  settleDrawVersionClaim,
  waitForDrawVersionToSettle,
} from "@/lib/draw-orchestration";
import { sendDrawCompletionEmails } from "@/lib/email/send-draw-emails";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAuthenticatedUser, getRequestScopedSupabaseClient } from "@/lib/supabase-request-client";

// A deliberate redraw: the round stays 'drawn', only current_draw_version
// moves forward (AC-DRAW-08). Separate from the initial draw endpoint on
// purpose — see its comment for why conflating "already drawn" with
// "therefore redraw" is the wrong call for a double-click of the original
// draw button.
//
// Concurrency: unlike the initial draw (a one-way open->drawn transition,
// so a late-arriving duplicate request always sees the terminal state and
// short-circuits), current_draw_version is *meant* to keep moving forward
// across separate, deliberate redraws — so "has it already changed?" on
// its own can't tell a duplicate request apart from a legitimately new
// one. claimNextDrawVersion (see its comment, and the
// claim_next_draw_version migration) claims the next version with a
// single atomic, self-referential UPDATE — no separate pre-read decides
// the version, so there's no gap for a losing request to read a
// stale-but-plausible value and start a redraw of its own. A request that
// loses the claim waits for the winner to finish and relays its version,
// rather than ever computing one itself.
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
    .select("id, name, organiser_id, state, wishes_required")
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

  const claim = await claimNextDrawVersion(admin, roundId);
  if (!claim.claimed) {
    const settledVersion = await waitForDrawVersionToSettle(admin, roundId);
    if (settledVersion === null) {
      return NextResponse.json({ error: "redraw_in_progress" }, { status: 503 });
    }
    return NextResponse.json({ drawVersion: settledVersion, alreadyDrawn: true });
  }

  const nextVersion = claim.nextVersion!;
  const outcome = await performDraw(admin, round, nextVersion);
  if (outcome.kind !== "drawn") {
    await revertDrawVersionClaim(admin, roundId, nextVersion - 1);
    return NextResponse.json(outcome, { status: outcome.kind === "not_ready" ? 409 : 422 });
  }

  await settleDrawVersionClaim(admin, roundId, nextVersion);

  await sendDrawCompletionEmails(admin, {
    roundId,
    roundName: round.name,
    drawVersion: nextVersion,
    isRedraw: true,
  });

  return NextResponse.json({ drawVersion: nextVersion, alreadyDrawn: false });
}
