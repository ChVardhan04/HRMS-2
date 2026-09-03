import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { EmailAdapter, SendEmailInput } from "./email-adapter.interface";

@Injectable()
export class SmtpEmailAdapter implements EmailAdapter {
  private readonly logger = new Logger(SmtpEmailAdapter.name);
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter() {
    if (this.transporter) return this.transporter;

    if (!process.env.SMTP_HOST) {
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure:
        String(process.env.SMTP_SECURE ?? "false").toLowerCase() === "true",
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
      connectionTimeout: Number(
        process.env.SMTP_CONNECTION_TIMEOUT_MS ?? 15000,
      ),
      greetingTimeout: Number(
        process.env.SMTP_GREETING_TIMEOUT_MS ?? 15000,
      ),
      socketTimeout: Number(
        process.env.SMTP_SOCKET_TIMEOUT_MS ?? 20000,
      ),
    });

    return this.transporter;
  }

  async send(input: SendEmailInput): Promise<void> {
    const transporter = this.getTransporter();

    if (!transporter) {
      this.logger.warn(
        `SMTP not configured - email to ${input.to} ("${input.subject}") was NOT sent.`,
      );
      return;
    }

    const from =
      process.env.SMTP_FROM ??
      process.env.EMAIL_FROM ??
      "HRMS <no-reply@your-company.com>";

    try {
      await transporter.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.body,
        html: input.html,
      });

      this.logger.log(
        `Email sent successfully to ${input.to} ("${input.subject}")`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send email to ${input.to}: ${
          error?.message ?? "Unknown SMTP error"
        }`,
      );
      throw error;
    }
  }
}
