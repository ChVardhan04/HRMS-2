import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { EmailAdapter, SendEmailInput } from "./email-adapter.interface";

@Injectable()
export class SmtpEmailAdapter implements EmailAdapter {
  private readonly logger = new Logger(SmtpEmailAdapter.name);
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter() {
    if (this.transporter) return this.transporter;
    if (!process.env.SMTP_HOST) return null;
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    return this.transporter;
  }

  async send(input: SendEmailInput): Promise<void> {
    const transporter = this.getTransporter();
    if (!transporter) {
      // No SMTP configured yet — log instead of pretending to send. This keeps local/dev
      // environments functional without a fake "success" that masks missing configuration.
      this.logger.warn(
        `SMTP not configured — email to ${input.to} ("${input.subject}") was NOT sent.`,
      );
      return;
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? "HRMS <no-reply@your-company.com>",
      to: input.to,
      subject: input.subject,
      text: input.body,
      html: input.html,
    });
  }
}
