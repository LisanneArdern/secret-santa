import { Resend } from "resend";
import type { EmailMessage, EmailSender } from "./email-sender";

export class ResendEmailSender implements EmailSender {
  private client: Resend | null = null;

  private getClient(): Resend {
    if (this.client) return this.client;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("ResendEmailSender: missing RESEND_API_KEY");
    }
    this.client = new Resend(apiKey);
    return this.client;
  }

  async send(message: EmailMessage): Promise<void> {
    const from = process.env.RESEND_FROM_EMAIL ?? "Santa Swap <onboarding@resend.dev>";
    const { error } = await this.getClient().emails.send({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
    if (error) {
      throw new Error(`ResendEmailSender: send failed — ${error.message}`);
    }
  }
}
