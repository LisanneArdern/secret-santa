// Whether an invite can be accepted right now — pure so the email-mismatch,
// expiry and revocation rules (SPEC.md "Invitations", AC-INV-02/03) are
// testable without a database or auth session.
export interface InvitationFacts {
  email: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
}

export type AcceptInvitationResult =
  | { ok: true }
  | { ok: false; reason: "revoked" }
  | { ok: false; reason: "expired" }
  | { ok: false; reason: "email_mismatch" };

export function canAcceptInvitation(
  invitation: InvitationFacts,
  input: { signedInEmail: string; now: Date },
): AcceptInvitationResult {
  if (invitation.revokedAt) {
    return { ok: false, reason: "revoked" };
  }

  if (invitation.expiresAt.getTime() <= input.now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  // Null email means a link invite: anyone holding the link may accept.
  if (
    invitation.email &&
    invitation.email.toLowerCase() !== input.signedInEmail.toLowerCase()
  ) {
    return { ok: false, reason: "email_mismatch" };
  }

  return { ok: true };
}
