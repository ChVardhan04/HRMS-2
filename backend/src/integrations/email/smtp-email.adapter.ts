import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";
import { EmailAdapter, SendEmailInput } from "./email-adapter.interface";

@Injectable()
export class SmtpEmailAdapter implements EmailAdapter {
  private readonly logger = new Logger(SmtpEmailAdapter.name);
  private resend: Resend | null = null;

  private getResend(): Resend | null {
    if (this.resend) {
      return this.resend;
    }

    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      this.logger.warn(
        "RESEND_API_KEY is not configured. Email will not be sent.",
      );
      return null;
    }

    this.resend = new Resend(apiKey);

    return this.resend;
  }

  async send(input: SendEmailInput): Promise<void> {
    const resend = this.getResend();

    if (!resend) {
      this.logger.warn(
        `Resend not configured - email to ${input.to} ("${input.subject}") was NOT sent.`,
      );
      return;
    }

    const from =
      process.env.EMAIL_FROM ??
      process.env.SMTP_FROM ??
      "HRMS <onboarding@resend.dev>";

    try {
      const { data, error } = await resend.emails.send({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html ?? `<p>${input.body.replace(/\n/g, "<br />")}</p>`,
        text: input.body,
      });

      if (error) {
        this.logger.error(
          `Failed to send email to ${input.to}: ${error.message}`,
        );

        throw new Error(error.message);
      }

      this.logger.log(
        `Email sent successfully to ${input.to} (id: ${data?.id ?? "unknown"})`,
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
