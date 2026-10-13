"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

// AC-EDGE-09: "Opening the link shows a confirm button; the token is only
// used when the button is pressed." This component never calls the
// confirm API on render/load — only the button's onClick does, and that
// API route (src/app/api/auth/confirm/route.ts) exports no GET handler at
// all, so there is no code path that can consume the token from a plain
// link open (an email security scanner pre-fetching it, for instance).
function ConfirmSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"idle" | "confirming" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") || "/";

  async function handleConfirm() {
    if (!tokenHash || !type) return;

    setStatus("confirming");
    setErrorMessage(null);

    const response = await fetch("/api/auth/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token_hash: tokenHash, type }),
    });

    if (!response.ok) {
      setStatus("error");
      setErrorMessage("This link has expired or was already used. Request a new one.");
      return;
    }

    const { accessToken, refreshToken } = await response.json();
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });

    router.push(next);
  }

  if (!tokenHash || !type) {
    return (
      <main className="page">
        <h1>Sign-in link incomplete</h1>
        <p>This link is missing some information. Request a new sign-in link.</p>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Confirm it&apos;s you</h1>
      <p>Press the button below to finish signing in.</p>
      <button
        type="button"
        className="btn-primary"
        onClick={handleConfirm}
        disabled={status === "confirming"}
      >
        {status === "confirming" ? "Confirming…" : "Confirm sign-in"}
      </button>
      {status === "error" && errorMessage && (
        <p className="error-text" role="alert">
          {errorMessage}
        </p>
      )}
    </main>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmSignIn />
    </Suspense>
  );
}
