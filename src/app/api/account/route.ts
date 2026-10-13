import { NextResponse } from "next/server";
import { canDeleteAccount } from "@/domain/account/validate-deletion";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAuthenticatedUser, getRequestScopedSupabaseClient } from "@/lib/supabase-request-client";

// AC-EDGE-10: account deletion is blocked while the user organises an open
// or drawn round.
export async function DELETE(request: Request) {
  const requestClient = getRequestScopedSupabaseClient(request);
  const user = requestClient ? await getAuthenticatedUser(requestClient) : null;
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: organisedRounds, error } = await admin
    .from("rounds")
    .select("state")
    .eq("organiser_id", user.id);

  if (error) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  const decision = canDeleteAccount(organisedRounds ?? []);
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.reason, blockingRoundCount: decision.blockingRoundCount },
      { status: 409 },
    );
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
