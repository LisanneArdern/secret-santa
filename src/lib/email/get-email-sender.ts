import type { EmailSender } from "./email-sender";
import { ResendEmailSender } from "./resend-email-sender";

let testOverride: EmailSender | null = null;
let defaultSender: EmailSender | null = null;

/**
 * Route handlers call this rather than constructing ResendEmailSender
 * directly, so tests can redirect every send through an in-memory fake
 * without needing a live Resend account or network access — see
 * setEmailSenderForTesting and tests/factories/fake-email-sender.ts.
 */
export function getEmailSender(): EmailSender {
  if (testOverride) return testOverride;
  if (!defaultSender) defaultSender = new ResendEmailSender();
  return defaultSender;
}

export function setEmailSenderForTesting(sender: EmailSender | null): void {
  testOverride = sender;
}
