import { NextResponse } from "next/server";
import { performDraw } from "@/lib/draw-orchestration";
import { sendDrawCompletionEmails } from "@/lib/email/send-draw-emails";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAuthenticatedUser, getRequestScopedSupabaseClient } from "@/lib/supabase-request-client";

// The initial draw only: state 'open' -> 'drawn'. Deliberately does *not*
// also serve redraws (see the sibling redraw/route.ts) — if the round is
// already 'drawn' by the time this runs, that's a double-click or two-tab
// duplicate of the *same* original click, so it must short-circuit and
// return the existing result (AC-EDGE-05), never silently perform a new
// redraw just because the state happens to already be 'drawn'.
//
// For true concurrency (two such requests overlapping), the claim is an
// atomic, WHERE-gated UPDATE: `WHERE state = 'open'`. Postgres guarantees
// that of two concurrent UPDATEs targeting the same row with the same
// WHERE condition, only the first to commit can match it — the second
// re-evaluates the WHERE clause against the now-already-updated row and
// matches nothing. So only one concurrent request can ever win the claim;
// the loser does no computation at all. Only the winner calls performDraw,
// and if that fails (infeasible exclusions, not ready, etc.) it reverts
// the claim it took. The same WHERE-gated pattern is what makes a settings
// edit raced against a draw fail cleanly too (AC-EDGE-06, see the sibling
// PATCH route).
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

  if (round.state === "drawn") {
    return NextResponse.json({ drawVersion: round.current_draw_version, alreadyDrawn: true });
  }
  if (round.state !== "open") {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }

  const nextVersion = (round.current_draw_version ?? 0) + 1;

  const claim = await admin
    .from("rounds")
    .update({ state: "drawn", current_draw_version: nextVersion })
    .eq("id", roundId)
    .eq("state", "open")
    .select("current_draw_version");

  if (claim.error) {
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }

  if (!claim.data || claim.data.length === 0) {
    // Lost the race: someone else's draw already won it. We never computed
    // anything, so there's nothing to discard — just report what actually
    // got committed.
    const { data: current } = await admin
      .from("rounds")
      .select("current_draw_version")
      .eq("id", roundId)
      .single();

    return NextResponse.json({ drawVersion: current?.current_draw_version, alreadyDrawn: true });
  }

  const outcome = await performDraw(admin, round, nextVersion);
  if (outcome.kind !== "drawn") {
    // We won the claim but the draw itself can't proceed — revert it so
    // the round isn't left marked as drawn with no assignments.
    await admin
      .from("rounds")
      .update({ state: "open", current_draw_version: round.current_draw_version })
      .eq("id", roundId);

    return NextResponse.json(outcome, { status: outcome.kind === "not_ready" ? 409 : 422 });
  }

  await sendDrawCompletionEmails(admin, {
    roundId,
    roundName: round.name,
    drawVersion: nextVersion,
    isRedraw: false,
  });

  return NextResponse.json({ drawVersion: nextVersion, alreadyDrawn: false });
}
