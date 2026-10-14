import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { sendEmailSafely } from "@/lib/email/send-safely";
import { baseUrl, invitedEmail } from "@/lib/email/templates";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAuthenticatedUser, getRequestScopedSupabaseClient } from "@/lib/supabase-request-client";

// Lists a round's invitations for its organiser (SPEC.md: "The organiser
// sees each invitee's status"). RLS's invitations_organiser_all policy is
// the actual access check — a non-organiser's request-scoped client
// simply gets an empty list back, not an error.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: roundId } = await params;

  const requestClient = getRequestScopedSupabaseClient(request);
  const user = requestClient ? await getAuthenticatedUser(requestClient) : null;
  if (!requestClient || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: invitations, error } = await requestClient
    .from("invitations")
    .select("*")
    .eq("round_id", roundId)
    .order("expires_at", { ascending: true });

  if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });

  return NextResponse.json({ invitations: invitations ?? [] });
}

// Creates an invitation — email-bound, or a link invite if `email` is
// omitted (SPEC.md "Invitations"). Both expire at the round's signup
// deadline. AC-EDGE-01: a second invite to an already-invited email is
// rejected rather than creating a duplicate.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: roundId } = await params;

  const requestClient = getRequestScopedSupabaseClient(request);
  const user = requestClient ? await getAuthenticatedUser(requestClient) : null;
  if (!requestClient || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim() || null;

  const admin = getSupabaseAdminClient();
  const { data: round, error: roundError } = await admin
    .from("rounds")
    .select("id, name, organiser_id, state, signup_deadline")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  if (!round) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (round.organiser_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (round.state !== "open") {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }

  if (email) {
    const { data: existing } = await admin
      .from("invitations")
      .select("id")
      .eq("round_id", roundId)
      .eq("email", email)
      .is("revoked_at", null)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "already_invited" }, { status: 409 });
    }
  }

  const { data: invitation, error } = await requestClient
    .from("invitations")
    .insert({
      round_id: roundId,
      email,
      token: crypto.randomBytes(24).toString("base64url"),
      expires_at: round.signup_deadline,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  // SPEC.md Notifications: "Invited to a round | Invitee". Link invites
  // have no bound address, so there's no one to email — sharing the link
  // is the organiser's job.
  if (email) {
    const { data: organiserUser } = await admin
      .from("users")
      .select("display_name, email")
      .eq("id", round.organiser_id)
      .maybeSingle();

    await sendEmailSafely({
      to: email,
      ...invitedEmail({
        roundName: round.name,
        organiserName: organiserUser?.display_name ?? organiserUser?.email ?? "Someone",
        inviteUrl: `${baseUrl()}/invite/${invitation.token}`,
      }),
    });
  }

  return NextResponse.json({ invitation }, { status: 201 });
}
