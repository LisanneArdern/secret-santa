import { describe, expect, it } from "vitest";
import { canAcceptInvitation } from "./validate-acceptance";

const now = new Date("2026-10-13T00:00:00Z");
const future = new Date("2026-11-01T00:00:00Z");
const past = new Date("2026-09-01T00:00:00Z");

describe("canAcceptInvitation", () => {
  it("[AC-INV-01] accepts a link invite (null email) for any signed-in email", () => {
    const result = canAcceptInvitation(
      { email: null, expiresAt: future, revokedAt: null },
      { signedInEmail: "anyone@example.com", now },
    );
    expect(result).toEqual({ ok: true });
  });

  it("accepts an email invite when the signed-in email matches, case-insensitively", () => {
    const result = canAcceptInvitation(
      { email: "Alice@Example.com", expiresAt: future, revokedAt: null },
      { signedInEmail: "alice@example.com", now },
    );
    expect(result).toEqual({ ok: true });
  });

  it("[AC-INV-03] rejects an email invite when the signed-in email doesn't match", () => {
    const result = canAcceptInvitation(
      { email: "alice@example.com", expiresAt: future, revokedAt: null },
      { signedInEmail: "mallory@example.com", now },
    );
    expect(result).toEqual({ ok: false, reason: "email_mismatch" });
  });

  it("[AC-INV-02] rejects a revoked invite", () => {
    const result = canAcceptInvitation(
      { email: null, expiresAt: future, revokedAt: new Date("2026-10-01T00:00:00Z") },
      { signedInEmail: "anyone@example.com", now },
    );
    expect(result).toEqual({ ok: false, reason: "revoked" });
  });

  it("[AC-INV-02] rejects an expired invite", () => {
    const result = canAcceptInvitation(
      { email: null, expiresAt: past, revokedAt: null },
      { signedInEmail: "anyone@example.com", now },
    );
    expect(result).toEqual({ ok: false, reason: "expired" });
  });
});
