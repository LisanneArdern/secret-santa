import { NextResponse } from "next/server";
import { validateRoundDates } from "@/domain/validation/dates";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAuthenticatedUser, getRequestScopedSupabaseClient } from "@/lib/supabase-request-client";

const EDITABLE_FIELDS = [
  "name",
  "budget_amount",
  "budget_currency",
  "signup_deadline",
  "wishes_required",
  "exchange_date",
  "exchange_place",
  "organiser_participates",
] as const;

// Fetches a round for its organiser or any of its participants — uses the
// caller's own request-scoped client (not the admin client) so Phase 2's
// rounds_select RLS policy is the actual access check, not a manual
// organiser-or-participant query we'd have to keep in sync with it.
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

  const { data: round, error } = await requestClient
    .from("rounds")
    .select("*")
    .eq("id", roundId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  if (!round) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ round, isOrganiser: round.organiser_id === user.id });
}

// AC-LIFE-01: settings cannot be changed after the draw. The UPDATE's
// `.in("state", ["draft", "open"])` is the enforcement — not just a
// pre-check — so it can't race a draw that commits in between reading the
// round and writing the edit (AC-EDGE-06). See the draw route for the
// matching half of this pattern.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: roundId } = await params;

  const requestClient = getRequestScopedSupabaseClient(request);
  const user = requestClient ? await getAuthenticatedUser(requestClient) : null;
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) updates[field] = body[field];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("rounds")
    .select("organiser_id, signup_deadline, exchange_date")
    .eq("id", roundId)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (existing.organiser_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const signupDeadline = new Date(
    (updates.signup_deadline as string | undefined) ?? existing.signup_deadline,
  );
  const exchangeDateSource =
    (updates.exchange_date as string | null | undefined) ?? existing.exchange_date;
  const exchangeDate = exchangeDateSource ? new Date(exchangeDateSource) : undefined;

  const dateCheck = validateRoundDates({ signupDeadline, exchangeDate, now: new Date() });
  if (!dateCheck.ok) {
    return NextResponse.json({ error: dateCheck.reason }, { status: 400 });
  }

  const { data: updated, error: updateError } = await admin
    .from("rounds")
    .update(updates)
    .eq("id", roundId)
    .in("state", ["draft", "open"])
    .select()
    .maybeSingle();

  if (updateError) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  if (!updated) {
    return NextResponse.json({ error: "draw_already_started" }, { status: 409 });
  }

  return NextResponse.json({ round: updated });
}
