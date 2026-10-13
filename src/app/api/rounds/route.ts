import { NextResponse } from "next/server";
import { validateRoundDates } from "@/domain/validation/dates";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAuthenticatedUser, getRequestScopedSupabaseClient } from "@/lib/supabase-request-client";

// Creating a round (SPEC.md "Round setup"). Any signed-in user can create
// one, as its organiser. Starts directly in 'open' — the spec's Draft
// state exists in the lifecycle table as "organiser configures the
// round", which the create form itself satisfies; there's no separate
// "open signup" action anywhere in the key screens, so skipping a
// distinct draft step keeps the flow matching "An organiser can set up a
// round and invite everyone in a few minutes".
export async function POST(request: Request) {
  const requestClient = getRequestScopedSupabaseClient(request);
  const user = requestClient ? await getAuthenticatedUser(requestClient) : null;
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof body.signup_deadline !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const signupDeadline = new Date(body.signup_deadline);
  const exchangeDate =
    typeof body.exchange_date === "string" ? new Date(body.exchange_date) : undefined;

  const dateCheck = validateRoundDates({ signupDeadline, exchangeDate, now: new Date() });
  if (!dateCheck.ok) {
    return NextResponse.json({ error: dateCheck.reason }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { data: round, error } = await admin
    .from("rounds")
    .insert({
      organiser_id: user.id,
      name: body.name.trim(),
      budget_amount: typeof body.budget_amount === "string" ? body.budget_amount : null,
      budget_currency: typeof body.budget_currency === "string" ? body.budget_currency : null,
      signup_deadline: signupDeadline.toISOString(),
      wishes_required: Boolean(body.wishes_required),
      exchange_date: exchangeDate ? exchangeDate.toISOString() : null,
      exchange_place: typeof body.exchange_place === "string" ? body.exchange_place : null,
      organiser_participates:
        typeof body.organiser_participates === "boolean" ? body.organiser_participates : true,
      state: "open",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  return NextResponse.json({ round }, { status: 201 });
}
