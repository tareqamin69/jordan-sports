import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** Sends plain-text emails (staff security alerts). Never put secrets or links with tokens in them. */
export interface EmailSender {
  readonly name: 'console' | 'smtp';
  send(message: EmailMessage): Promise<void>;
}

/** Development / no SMTP configured: logs the email (recipient partly masked). */
export class ConsoleEmailSender implements EmailSender {
  readonly name = 'console' as const;
  private readonly logger = new Logger('Email');

  async send(message: EmailMessage): Promise<void> {
    const [user = '', domain = ''] = message.to.split('@');
    this.logger.log(`DEV ONLY — email to ${user.slice(0, 2)}…@${domain}: ${message.subject}`);
  }
}

export class SmtpEmailSender implements EmailSender {
  readonly name = 'smtp' as const;
  private readonly transport: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = createTransport(smtpUrl);
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}
