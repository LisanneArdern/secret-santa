import { NextResponse } from "next/server";
import { shouldCompleteRound } from "@/domain/round-lifecycle/scheduled-transitions";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

// SPEC.md lifecycle: Drawn -> Completed once the exchange date passes.
// Not a user action (see state-machine.ts's comment on "complete") — this
// cron job (vercel.json) is what actually performs it. Idempotent by
// construction: once a round's state is no longer 'drawn', the
// WHERE-gated UPDATE below simply stops matching it on later runs.
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: candidates, error } = await admin
    .from("rounds")
    .select("id, state, exchange_date")
    .eq("state", "drawn")
    .not("exchange_date", "is", null);
  if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });

  const now = new Date();
  const toComplete = (candidates ?? []).filter((round) =>
    shouldCompleteRound({ state: round.state, exchangeDate: new Date(round.exchange_date!) }, now),
  );

  if (toComplete.length > 0) {
    await admin
      .from("rounds")
      .update({ state: "completed" })
      .in(
        "id",
        toComplete.map((r) => r.id),
      )
      .eq("state", "drawn");
  }

  return NextResponse.json({ completed: toComplete.length });
}
