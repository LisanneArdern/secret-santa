"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type Status = "checking" | "signed_out" | "ready" | "joining" | "joined" | "error";

const ERROR_MESSAGES: Record<string, string> = {
  email_mismatch: "This invite is for a different email address. Sign in with the email it was sent to.",
  revoked: "This invite link has been turned off by the organiser.",
  expired: "This invite link has expired. Ask the organiser for a new one.",
  not_found: "This invite link doesn't exist. Check you copied the whole link.",
};

export function JoinRoundButton({
  token,
  invitationEmail,
}: {
  token: string;
  invitationEmail: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? "ready" : "signed_out");
    });
  }, []);

  function goToSignIn() {
    const query = new URLSearchParams({ next: `/invite/${token}` });
    if (invitationEmail) query.set("email", invitationEmail);
    router.push(`/sign-in?${query.toString()}`);
  }

  async function handleJoin() {
    setStatus("joining");
    setErrorMessage(null);

    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      setStatus("signed_out");
      return;
    }

    const response = await fetch(`/api/invitations/${token}/accept`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      setErrorMessage(
        (body.error && ERROR_MESSAGES[body.error]) ?? "Something went wrong. Try again.",
      );
      return;
    }

    setStatus("joined");
  }

  if (status === "checking") return null;

  if (status === "joined") {
    return <p>You&apos;re in! The organiser will let you know what happens next.</p>;
  }

  if (status === "signed_out") {
    return (
      <button type="button" className="btn-primary" onClick={goToSignIn}>
        Sign in to join
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="btn-primary"
        onClick={handleJoin}
        disabled={status === "joining"}
      >
        {status === "joining" ? "Joining…" : "Join round"}
      </button>
      {status === "error" && errorMessage && (
        <p className="error-text" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
