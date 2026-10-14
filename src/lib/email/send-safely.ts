import type { EmailMessage } from "./email-sender";
import { getEmailSender } from "./get-email-sender";

/**
 * A dropped notification shouldn't block the action that triggered it —
 * creating a round, drawing names, etc. all succeed even if the email
 * provider is unreachable or (as in local dev without RESEND_API_KEY)
 * unconfigured. Errors are logged, not surfaced to the caller.
 */
export async function sendEmailSafely(message: EmailMessage): Promise<void> {
  try {
    await getEmailSender().send(message);
  } catch (error) {
    console.error("sendEmailSafely: failed to send email", error);
  }
}
