export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

/** Abstraction so the concrete provider (SMTP, SendGrid, console-in-dev) can be swapped freely. */
export interface EmailAdapter {
  send(input: SendEmailInput): Promise<void>;
}

export const EMAIL_ADAPTER = "EMAIL_ADAPTER";
