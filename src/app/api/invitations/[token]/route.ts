import { NextResponse } from "next/server";
import { getInvitationSummary } from "@/lib/invitation-summary";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

// Public lookup for the Invite page (SPEC.md key screens: "Invite page" —
// round name, organiser, budget, exchange date). The invitee isn't signed
// in yet, so this goes through the service role rather than a user-scoped
// RLS policy. The Invite page's own server component calls
// getInvitationSummary directly rather than fetching this route; this
// endpoint exists for any other client that needs the same lookup.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const invitation = await getInvitationSummary(getSupabaseAdminClient(), token);

  if (!invitation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ invitation });
}
