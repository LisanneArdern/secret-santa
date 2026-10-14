import { NextResponse } from "next/server";
import { canDeleteAccount } from "@/domain/account/validate-deletion";
import { validateDisplayName } from "@/domain/validation/display-name";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAuthenticatedUser, getRequestScopedSupabaseClient } from "@/lib/supabase-request-client";

// Sets the caller's own display name (SPEC.md User.displayName) — magic-link
// sign-in never collects one, so this is how the one-time /welcome step
// (and any later edit) saves it. Uses the request-scoped client so the
// users_update_self RLS policy is the access check, not a manual one.
export async function PATCH(request: Request) {
  const requestClient = getRequestScopedSupabaseClient(request);
  const user = requestClient ? await getAuthenticatedUser(requestClient) : null;
  if (!requestClient || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { display_name?: string } | null;
  if (!body || typeof body.display_name !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const check = validateDisplayName(body.display_name);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason, maxLength: check.maxLength }, { status: 400 });
  }

  const { error } = await requestClient
    .from("users")
    .update({ display_name: check.value })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ displayName: check.value });
}

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
