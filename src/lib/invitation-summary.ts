import type { SupabaseClient } from "@supabase/supabase-js";

// Shared by the public lookup API route and the Invite page's server
// component, so the (slightly fiddly, nested-join) query lives in one
// place rather than two.
export interface InvitationSummary {
  id: string;
  email: string | null;
  expiresAt: string;
  revokedAt: string | null;
  status: string;
  round: {
    name: string;
    budgetAmount: string | null;
    budgetCurrency: string | null;
    exchangeDate: string | null;
    exchangePlace: string | null;
    organiserDisplayName: string | null;
  };
}

interface RoundJoinRow {
  name: string;
  budget_amount: string | null;
  budget_currency: string | null;
  exchange_date: string | null;
  exchange_place: string | null;
  organiser: { display_name: string | null } | null;
}

export async function getInvitationSummary(
  admin: SupabaseClient,
  token: string,
): Promise<InvitationSummary | null> {
  const { data, error } = await admin
    .from("invitations")
    .select(
      "id, email, expires_at, revoked_at, status, rounds(name, budget_amount, budget_currency, exchange_date, exchange_place, organiser:users(display_name))",
    )
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return null;

  const round = data.rounds as unknown as RoundJoinRow;

  return {
    id: data.id,
    email: data.email,
    expiresAt: data.expires_at,
    revokedAt: data.revoked_at,
    status: data.status,
    round: {
      name: round.name,
      budgetAmount: round.budget_amount,
      budgetCurrency: round.budget_currency,
      exchangeDate: round.exchange_date,
      exchangePlace: round.exchange_place,
      organiserDisplayName: round.organiser?.display_name ?? null,
    },
  };
}
