import type { EmailMessage, EmailSender } from "@/lib/email/email-sender";

export class FakeEmailSender implements EmailSender {
  sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  sentTo(to: string): EmailMessage[] {
    return this.sent.filter((m) => m.to === to);
  }

  reset(): void {
    this.sent = [];
  }
}
