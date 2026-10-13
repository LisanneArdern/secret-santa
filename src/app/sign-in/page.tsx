"use client";

import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

// SPEC.md key screens: "Sign in | Everyone | Email field, explanation of
// the magic link | Send sign-in link".
export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setStatus("error");
      setErrorMessage("Enter a valid email address.");
      return;
    }

    setStatus("sending");
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      setStatus("error");
      setErrorMessage("We couldn't send the link. Wait a moment and try again.");
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <main className="page">
        <h1>Check your email</h1>
        <p>
          We sent a sign-in link to <strong>{email.trim()}</strong>. Open it on
          this device or any other to continue.
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Sign in</h1>
      <p>
        No password needed — we&apos;ll email you a link to sign in.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={status === "error"}
            aria-describedby={status === "error" ? "email-error" : undefined}
          />
          {status === "error" && errorMessage && (
            <p id="email-error" className="error-text" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
        <button type="submit" className="btn-primary" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send sign-in link"}
        </button>
      </form>
    </main>
  );
}
