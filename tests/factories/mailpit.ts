const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

interface MailpitMessageSummary {
  ID: string;
  To: { Address: string }[];
  Created: string;
}

interface MailpitMessagesResponse {
  messages: MailpitMessageSummary[];
}

interface MailpitMessage {
  HTML: string;
  Text: string;
}

/**
 * Polls Mailpit (the local Supabase stack's email catcher) for the most
 * recent message to `email`, so tests can drive the real magic-link flow
 * end to end instead of mocking the email provider.
 */
async function findLatestMessageTo(email: string, timeoutMs = 5000): Promise<MailpitMessageSummary> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    const body = (await response.json()) as MailpitMessagesResponse;
    const matches = body.messages
      .filter((m) => m.To.some((to) => to.Address === email))
      .sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime());

    if (matches.length > 0) return matches[0];
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`findLatestMessageTo: no message arrived for ${email} within ${timeoutMs}ms`);
}

export async function getLatestMagicLinkParams(
  email: string,
): Promise<{ tokenHash: string; type: string }> {
  const summary = await findLatestMessageTo(email);
  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${summary.ID}`);
  const message = (await response.json()) as MailpitMessage;

  const match = message.HTML.match(/token_hash=([^&"]+)&type=([^&"]+)/);
  if (!match) {
    throw new Error("getLatestMagicLinkParams: couldn't find token_hash/type in email body");
  }

  return { tokenHash: decodeURIComponent(match[1]), type: decodeURIComponent(match[2]) };
}

export async function deleteAllMessages(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
}
