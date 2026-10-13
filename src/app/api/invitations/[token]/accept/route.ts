import { NextResponse } from "next/server";
import { canAcceptInvitation } from "@/domain/invites/validate-acceptance";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAuthenticatedUser, getRequestScopedSupabaseClient } from "@/lib/supabase-request-client";

// Joining a round (SPEC.md "Invitations", "Authentication"). Idempotent:
// the unique (round_id, user_id) constraint means accepting twice just
// finds the existing participant instead of erroring (AC-EDGE-01).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const requestClient = getRequestScopedSupabaseClient(request);
  const user = requestClient ? await getAuthenticatedUser(requestClient) : null;
  if (!user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: invitation, error: invitationError } = await admin
    .from("invitations")
    .select("id, round_id, email, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (invitationError) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!invitation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const acceptance = canAcceptInvitation(
    {
      email: invitation.email,
      expiresAt: new Date(invitation.expires_at),
      revokedAt: invitation.revoked_at ? new Date(invitation.revoked_at) : null,
    },
    { signedInEmail: user.email, now: new Date() },
  );

  if (!acceptance.ok) {
    return NextResponse.json({ error: acceptance.reason }, { status: 403 });
  }

  const { data: existingParticipant, error: existingError } = await admin
    .from("participants")
    .select("id")
    .eq("round_id", invitation.round_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  let participantId = existingParticipant?.id as string | undefined;
  if (!participantId) {
    const { data: created, error: createError } = await admin
      .from("participants")
      .insert({ round_id: invitation.round_id, user_id: user.id })
      .select("id")
      .single();
    if (createError) {
      return NextResponse.json({ error: "join_failed" }, { status: 500 });
    }
    participantId = created.id as string;
  }

  await admin.from("invitations").update({ status: "joined" }).eq("id", invitation.id);

  return NextResponse.json({ roundId: invitation.round_id, participantId });
}
