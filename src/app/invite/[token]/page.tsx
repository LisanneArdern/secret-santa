import { notFound } from "next/navigation";
import { canAcceptInvitation } from "@/domain/invites/validate-acceptance";
import { getInvitationSummary } from "@/lib/invitation-summary";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { JoinRoundButton } from "./join-round-button";

// Looks up a fresh, per-request DB row (token -> invitation/round) — not
// something to prerender/cache statically, so opt this route out of
// Next.js 16's Cache Components default (next.config.ts: cacheComponents).
export const instant = false;

// SPEC.md key screens: "Invite page | Invitee | Round name, organiser,
// budget, exchange date | Join round".
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await getInvitationSummary(getSupabaseAdminClient(), token);

  if (!invitation) {
    notFound();
  }

  // Reuses the same pure check the accept API enforces, just for display
  // here — signedInEmail is set to the invite's own email (or "" for a
  // link invite) because nobody is signed in yet at this point, so the
  // email-mismatch branch is irrelevant; only revoked/expired matter.
  const check = canAcceptInvitation(
    {
      email: invitation.email,
      expiresAt: new Date(invitation.expiresAt),
      revokedAt: invitation.revokedAt ? new Date(invitation.revokedAt) : null,
    },
    { signedInEmail: invitation.email ?? "", now: new Date() },
  );

  if (!check.ok && check.reason !== "email_mismatch") {
    return (
      <main className="page">
        <h1>This invite isn&apos;t available</h1>
        <p>
          {check.reason === "revoked"
            ? "This invite link has been turned off by the organiser."
            : "This invite link has expired. Ask the organiser for a new one."}
        </p>
      </main>
    );
  }

  const { round } = invitation;

  return (
    <main className="page">
      <h1>{round.name}</h1>
      <p>{round.organiserDisplayName ?? "Someone"} invited you to a Secret Santa round.</p>
      <dl>
        {round.budgetAmount && (
          <div>
            <dt>Budget</dt>
            <dd>
              {round.budgetAmount} {round.budgetCurrency}
            </dd>
          </div>
        )}
        {round.exchangeDate && (
          <div>
            <dt>Exchange date</dt>
            <dd>{new Date(round.exchangeDate).toLocaleDateString()}</dd>
          </div>
        )}
        {round.exchangePlace && (
          <div>
            <dt>Where</dt>
            <dd>{round.exchangePlace}</dd>
          </div>
        )}
      </dl>
      <JoinRoundButton token={token} invitationEmail={invitation.email} />
    </main>
  );
}
