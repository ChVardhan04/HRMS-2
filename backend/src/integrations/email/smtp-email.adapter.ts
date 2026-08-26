import { Injectable, Logger } from "@nestjs/common";
import { EmailAdapter, SendEmailInput } from "./email-adapter.interface";

@Injectable()
export class SmtpEmailAdapter implements EmailAdapter {
  private readonly logger = new Logger(SmtpEmailAdapter.name);

  async send(input: SendEmailInput): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY is not configured - email to ${input.to} ("${input.subject}") was NOT sent.`,
      );
      return;
    }

    const from =
      process.env.EMAIL_FROM ??
      "HRMS <onboarding@resend.dev>";

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: input.subject,
          text: input.body,
          html:
            input.html ??
            `<p>${input.body.replace(/\n/g, "<br />")}</p>`,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        const message =
          result?.message ??
          result?.error?.message ??
          `Resend API returned HTTP ${response.status}`;

        this.logger.error(
          `Failed to send email to ${input.to}: ${message}`,
        );

        throw new Error(message);
      }

      this.logger.log(
        `Email sent successfully to ${input.to} (id: ${
          result?.id ?? "unknown"
        })`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send email to ${input.to}: ${
          error?.message ?? "Unknown email error"
        }`,
      );

      throw error;
    }
  }
}
