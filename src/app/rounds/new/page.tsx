"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

// SPEC.md key screens: "Create round | Organiser | Short step-by-step
// form: basics, budget and dates, participation, exclusions | Create
// round". Exclusions aren't on this form — they reference participants,
// who don't exist yet for a round that's only just being created; they're
// added from the round page once people have joined.
export default function CreateRoundPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  const [name, setName] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("GBP");
  const [signupDeadline, setSignupDeadline] = useState("");
  const [wishesRequired, setWishesRequired] = useState(false);
  const [exchangeDate, setExchangeDate] = useState("");
  const [exchangePlace, setExchangePlace] = useState("");
  const [organiserParticipates, setOrganiserParticipates] = useState(true);

  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/sign-in?next=/rounds/new");
        return;
      }
      setCheckingSession(false);
    });
    // router is only used imperatively (push) here, never read reactively —
    // see the matching comment in rounds/[id]/page.tsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setStatus("error");
      setErrorMessage("Give the round a name.");
      return;
    }
    if (!signupDeadline) {
      setStatus("error");
      setErrorMessage("Choose a signup deadline.");
      return;
    }

    setStatus("submitting");
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      router.push("/sign-in?next=/rounds/new");
      return;
    }

    const response = await fetch("/api/rounds", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        name: name.trim(),
        budget_amount: budgetAmount || undefined,
        budget_currency: budgetAmount ? budgetCurrency : undefined,
        signup_deadline: new Date(signupDeadline).toISOString(),
        wishes_required: wishesRequired,
        exchange_date: exchangeDate ? new Date(exchangeDate).toISOString() : undefined,
        exchange_place: exchangePlace || undefined,
        organiser_participates: organiserParticipates,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      setErrorMessage(
        body.error === "signup_deadline_in_past"
          ? "The signup deadline can't be in the past."
          : body.error === "signup_deadline_after_exchange_date"
            ? "The signup deadline must be before the exchange date."
            : "Something went wrong. Check the form and try again.",
      );
      return;
    }

    const { round } = await response.json();
    router.push(`/rounds/${round.id}`);
  }

  if (checkingSession) return null;

  return (
    <main className="page">
      <h1>Create a round</h1>
      <form onSubmit={handleSubmit} noValidate className="card-form">
        <fieldset>
          <legend>Basics</legend>
          <div className="field">
            <label htmlFor="name">Round name</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Family Christmas"
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>Budget and dates</legend>
          <div className="field">
            <label htmlFor="budget-amount">Budget (optional)</label>
            <input
              id="budget-amount"
              inputMode="decimal"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              placeholder="20.00"
            />
          </div>
          <div className="field">
            <label htmlFor="budget-currency">Currency</label>
            <input
              id="budget-currency"
              value={budgetCurrency}
              onChange={(e) => setBudgetCurrency(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="signup-deadline">Signup deadline</label>
            <input
              id="signup-deadline"
              type="date"
              value={signupDeadline}
              onChange={(e) => setSignupDeadline(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="exchange-date">Exchange date (optional)</label>
            <input
              id="exchange-date"
              type="date"
              value={exchangeDate}
              onChange={(e) => setExchangeDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="exchange-place">Exchange place (optional)</label>
            <input
              id="exchange-place"
              value={exchangePlace}
              onChange={(e) => setExchangePlace(e.target.value)}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>Participation</legend>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={wishesRequired}
              onChange={(e) => setWishesRequired(e.target.checked)}
            />
            Require everyone to add wishes before drawing
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={organiserParticipates}
              onChange={(e) => setOrganiserParticipates(e.target.checked)}
            />
            I&apos;m taking part too
          </label>
        </fieldset>

        {status === "error" && errorMessage && (
          <p className="error-text" role="alert">
            {errorMessage}
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={status === "submitting"}>
          {status === "submitting" ? "Creating…" : "Create round"}
        </button>
      </form>
    </main>
  );
}
