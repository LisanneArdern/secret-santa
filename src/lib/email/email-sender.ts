// Same injectable-dependency pattern as the draw's RandomSource
// (src/domain/draw/random.ts): production code depends on this interface,
// never on Resend directly, so tests can swap in an in-memory fake and
// assert exactly who received which email (SPEC.md Testing guidelines:
// "Use a fake email provider in tests and assert who received which email
// and that each draw email names only that recipient's giftee").
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
