"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

// Magic-link sign-in never collects a name, so this is the one-time step
// between confirming sign-in and continuing on — auth/confirm/page.tsx
// only sends a first-time user here (see its `needsDisplayName` check).
// Without it, every giftee reveal and notification email would show a
// generic placeholder forever instead of the person's actual name.
function WelcomeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setErrorMessage(null);

    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      router.push(`/sign-in?next=${encodeURIComponent(`/welcome?next=${next}`)}`);
      return;
    }

    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ display_name: name }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      setErrorMessage(
        body.error === "too_long" ? "That's too long — keep it under 60 characters." : "Enter your name.",
      );
      return;
    }

    router.push(next);
  }

  return (
    <main className="page">
      <h1>Welcome!</h1>
      <p>What should we call you? This is the name your giftee and other participants will see.</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="display-name">Your name</label>
          <input
            id="display-name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={status === "error"}
            aria-describedby={status === "error" ? "display-name-error" : undefined}
          />
          {status === "error" && errorMessage && (
            <p id="display-name-error" className="error-text" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
        <button type="submit" className="btn-primary" disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Continue"}
        </button>
      </form>
    </main>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeForm />
    </Suspense>
  );
}
