"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

interface MyGifteeResponse {
  drawn: boolean;
  round: {
    budgetAmount: string | null;
    budgetCurrency: string | null;
    exchangeDate: string | null;
    exchangePlace: string | null;
  };
  giftee?: {
    displayName: string | null;
    wishes: string | null;
    notes: string | null;
  };
}

// SPEC.md key screens: "My giftee | Participant | Giftee name, wishes,
// notes, budget, exchange date | None, read-only". SPEC.md "Viewing the
// result": "They never see who drew them" — this page only ever renders
// what /api/rounds/[id]/my-giftee returns, and that response has no
// giver-identifying field at all (see the route's own comment).
function MyGifteeContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const roundId = params.id;

  const [data, setData] = useState<MyGifteeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        router.push(`/sign-in?next=/rounds/${roundId}/giftee`);
        return;
      }

      const response = await fetch(`/api/rounds/${roundId}/my-giftee`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (cancelled) return;
      if (!response.ok) {
        setLoadError(
          response.status === 404
            ? "You're not part of this round."
            : "Something went wrong loading your giftee.",
        );
        return;
      }
      setData(await response.json());
    }

    load();
    return () => {
      cancelled = true;
    };
    // router is only used imperatively (push) here, never read reactively —
    // see the matching comment in rounds/[id]/page.tsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  if (loadError) {
    return (
      <main className="page">
        <h1>Can&apos;t show your giftee</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  if (!data) return null;

  if (!data.drawn) {
    return (
      <main className="page">
        <h1>My giftee</h1>
        <p>The draw hasn&apos;t happened yet. Check back once the organiser draws names.</p>
      </main>
    );
  }

  const { giftee, round } = data;

  return (
    <main className="page">
      <h1>My giftee</h1>
      <section className="reveal">
        <p className="reveal-icon" aria-hidden="true">
          🎁
        </p>
        <p>
          You&apos;re buying for <strong>{giftee?.displayName ?? "your giftee"}</strong>.
        </p>
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
        {giftee?.wishes && (
          <div>
            <h2>Their wishes</h2>
            <p>{giftee.wishes}</p>
          </div>
        )}
        {giftee?.notes && (
          <div>
            <h2>Notes</h2>
            <p>{giftee.notes}</p>
          </div>
        )}
        {!giftee?.wishes && !giftee?.notes && <p>They haven&apos;t added any wishes yet.</p>}
      </section>
    </main>
  );
}

export default function MyGifteePage() {
  return (
    <Suspense fallback={null}>
      <MyGifteeContent />
    </Suspense>
  );
}
