import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

// Public lookup for the Invite page (SPEC.md key screens: "Invite page" —
// round name, organiser, budget, exchange date). The invitee isn't signed
// in yet, so this goes through the service role rather than a user-scoped
// RLS policy.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const admin = getSupabaseAdminClient();

  const { data: invitation, error } = await admin
    .from("invitations")
    .select(
      "id, email, expires_at, revoked_at, status, rounds(name, budget_amount, budget_currency, exchange_date, exchange_place)",
    )
    .eq("token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!invitation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ invitation });
}
