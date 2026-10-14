"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

interface RoundDetail {
  id: string;
  name: string;
  budget_amount: string | null;
  budget_currency: string | null;
  signup_deadline: string;
  exchange_date: string | null;
  exchange_place: string | null;
  wishes_required: boolean;
  organiser_participates: boolean;
  state: string;
}

interface Invitation {
  id: string;
  email: string | null;
  token: string;
  status: string;
  expires_at: string;
}

interface MyParticipant {
  id: string;
  status: string;
  wishes: string | null;
  notes: string | null;
}

// SPEC.md key screens: "Round page (organiser) | Organiser | People and
// their status (who is not ready highlighted), settings summary,
// exclusions | Invite people / Draw names". Exclusions management and the
// participant-facing wishes view land in later PRs — this covers the
// organiser's invite + draw loop end to end.
function RoundPageContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const roundId = params.id;

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [round, setRound] = useState<RoundDetail | null>(null);
  const [isOrganiser, setIsOrganiser] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<"idle" | "sending" | "error">("idle");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [drawStatus, setDrawStatus] = useState<"idle" | "drawing" | "error">("idle");
  const [drawError, setDrawError] = useState<string | null>(null);

  const [participant, setParticipant] = useState<MyParticipant | null>(null);
  const [wishesInput, setWishesInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [wishesStatus, setWishesStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [wishesError, setWishesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.push(`/sign-in?next=/rounds/${roundId}`);
        return;
      }
      if (cancelled) return;
      setAccessToken(token);

      const response = await fetch(`/api/rounds/${roundId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (cancelled) return;
      if (!response.ok) {
        setLoadError(
          response.status === 404
            ? "This round doesn't exist, or you don't have access to it."
            : "Something went wrong loading this round.",
        );
        return;
      }
      const body = await response.json();
      if (cancelled) return;
      setRound(body.round);
      setIsOrganiser(body.isOrganiser);
      if (body.participant) {
        setParticipant(body.participant);
        setWishesInput(body.participant.wishes ?? "");
        setNotesInput(body.participant.notes ?? "");
      }

      if (body.isOrganiser) {
        const invitesResponse = await fetch(`/api/rounds/${roundId}/invitations`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!cancelled && invitesResponse.ok) {
          const invitesBody = await invitesResponse.json();
          setInvitations(invitesBody.invitations);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // router is only used imperatively (push) here, never read reactively —
    // including it would re-run this effect whenever its identity changes,
    // which next/navigation doesn't guarantee is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setInviteStatus("sending");
    setInviteError(null);

    const response = await fetch(`/api/rounds/${roundId}/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ email: inviteEmail.trim() || undefined }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setInviteStatus("error");
      setInviteError(
        body.error === "already_invited"
          ? "That person is already invited."
          : "Couldn't send the invite. Try again.",
      );
      return;
    }

    const { invitation } = await response.json();
    setInvitations((prev) => [...prev, invitation]);
    setInviteEmail("");
    setInviteStatus("idle");
  }

  async function handleDraw() {
    if (!accessToken) return;
    setDrawStatus("drawing");
    setDrawError(null);

    const response = await fetch(`/api/rounds/${roundId}/draw`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { kind?: string; minimumRequired?: number };
      setDrawStatus("error");
      setDrawError(
        body.kind === "too_few_participants"
          ? `At least ${body.minimumRequired} people need to have joined before you can draw.`
          : body.kind === "not_ready"
            ? "Not everyone has added their wishes yet."
            : body.kind === "infeasible_exclusions"
              ? "The exclusions make a fair draw impossible — remove one and try again."
              : "Couldn't draw. Try again.",
      );
      return;
    }

    setRound((prev) => (prev ? { ...prev, state: "drawn" } : prev));
    setDrawStatus("idle");
  }

  async function handleSaveWishes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setWishesStatus("saving");
    setWishesError(null);

    const response = await fetch(`/api/rounds/${roundId}/wishes`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ wishes: wishesInput, notes: notesInput }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setWishesStatus("error");
      setWishesError(
        body.error === "too_long" ? "That's too long — keep it under 2,000 characters." : "Couldn't save. Try again.",
      );
      return;
    }

    setWishesStatus("saved");
  }

  if (loadError) {
    return (
      <main className="page">
        <h1>Round unavailable</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  if (!round) return null;

  return (
    <main className="page">
      <h1>{round.name}</h1>
      <p>
        {round.state === "open" &&
          `Waiting for people to join. Signup closes ${new Date(
            round.signup_deadline,
          ).toLocaleDateString()}.`}
        {round.state === "drawn" && "Names have been drawn."}
        {round.state !== "open" && round.state !== "drawn" && `Status: ${round.state}`}
      </p>

      <section>
        <h2>Settings</h2>
        <dl>
          {round.budget_amount && (
            <div>
              <dt>Budget</dt>
              <dd>
                {round.budget_amount} {round.budget_currency}
              </dd>
            </div>
          )}
          {round.exchange_date && (
            <div>
              <dt>Exchange date</dt>
              <dd>{new Date(round.exchange_date).toLocaleDateString()}</dd>
            </div>
          )}
          {round.exchange_place && (
            <div>
              <dt>Where</dt>
              <dd>{round.exchange_place}</dd>
            </div>
          )}
          <div>
            <dt>Wishes required</dt>
            <dd>{round.wishes_required ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </section>

      {participant && (round.state === "open" || round.state === "drawn") && (
        <section>
          <h2>My wishes</h2>
          <form onSubmit={handleSaveWishes}>
            <div className="field">
              <label htmlFor="my-wishes">
                What would you like? (visible only to your giver)
              </label>
              <textarea
                id="my-wishes"
                rows={4}
                value={wishesInput}
                onChange={(e) => {
                  setWishesInput(e.target.value);
                  setWishesStatus("idle");
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="my-notes">Sizes, allergies, things to avoid (optional)</label>
              <textarea
                id="my-notes"
                rows={2}
                value={notesInput}
                onChange={(e) => {
                  setNotesInput(e.target.value);
                  setWishesStatus("idle");
                }}
              />
            </div>
            {wishesStatus === "error" && wishesError && (
              <p className="error-text" role="alert">
                {wishesError}
              </p>
            )}
            {wishesStatus === "saved" && <p>Saved.</p>}
            <button type="submit" className="btn-secondary" disabled={wishesStatus === "saving"}>
              {wishesStatus === "saving" ? "Saving…" : "Save my wishes"}
            </button>
          </form>
        </section>
      )}

      {round.state === "drawn" && (
        <section>
          <h2>Your giftee</h2>
          <p>Names have been drawn — see who you&apos;re buying for.</p>
          <Link href={`/rounds/${roundId}/giftee`} className="btn-secondary">
            My giftee
          </Link>
        </section>
      )}

      {isOrganiser && (
        <>
          <section>
            <h2>People</h2>
            {invitations.length === 0 ? (
              <p>Nobody invited yet.</p>
            ) : (
              <ul>
                {invitations.map((invite) => (
                  <li key={invite.id}>
                    <span>{invite.email ?? "Link invite"}</span>
                    <span className="badge">{invite.status}</span>
                    <a href={`/invite/${invite.token}`} target="_blank" rel="noopener noreferrer">
                      open invite link
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {round.state === "open" && (
              <form onSubmit={handleInvite}>
                <div className="field">
                  <label htmlFor="invite-email">
                    Invite by email (leave blank for a shareable link)
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                {inviteStatus === "error" && inviteError && (
                  <p className="error-text" role="alert">
                    {inviteError}
                  </p>
                )}
                <button type="submit" className="btn-secondary" disabled={inviteStatus === "sending"}>
                  {inviteStatus === "sending" ? "Inviting…" : "Invite"}
                </button>
              </form>
            )}
          </section>

          {round.state === "open" && (
            <section>
              <button
                type="button"
                className="btn-primary"
                onClick={handleDraw}
                disabled={drawStatus === "drawing"}
              >
                {drawStatus === "drawing" ? "Drawing…" : "Draw names"}
              </button>
              {drawStatus === "error" && drawError && (
                <p className="error-text" role="alert">
                  {drawError}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default function RoundPage() {
  return (
    <Suspense fallback={null}>
      <RoundPageContent />
    </Suspense>
  );
}
