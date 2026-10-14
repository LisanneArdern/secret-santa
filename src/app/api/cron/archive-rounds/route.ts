import { NextResponse } from "next/server";
import { shouldArchiveRound } from "@/domain/round-lifecycle/scheduled-transitions";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

// AC-PRIV-05: 60 days after the exchange date, all personal data of the
// round is deleted. Every child table (invitations, participants,
// participant_wishes, exclusions, assignments) cascades on rounds.id, so
// deleting the round row is what actually satisfies "all personal data...
// is deleted" — there's deliberately no softer, scrubbed-but-kept
// "archived" row to maintain: SPEC.md's lifecycle table lists no actions
// at all for Archived ("Personal data deleted"), and the decision log
// says plainly "then data is gone".
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: candidates, error } = await admin
    .from("rounds")
    .select("id, state, exchange_date")
    .eq("state", "completed")
    .not("exchange_date", "is", null);
  if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });

  const now = new Date();
  const toArchive = (candidates ?? []).filter((round) =>
    shouldArchiveRound({ state: round.state, exchangeDate: new Date(round.exchange_date!) }, now),
  );

  if (toArchive.length > 0) {
    await admin
      .from("rounds")
      .delete()
      .in(
        "id",
        toArchive.map((r) => r.id),
      )
      .eq("state", "completed");
  }

  return NextResponse.json({ archived: toArchive.length });
}
