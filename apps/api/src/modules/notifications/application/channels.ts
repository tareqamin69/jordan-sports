import { Logger } from '@nestjs/common';

export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');

/** Delivers a text message. SMS / WhatsApp providers implement this later (provider TBD). */
export interface NotificationChannel {
  readonly name: 'console' | 'sms' | 'whatsapp' | 'email';
  send(recipient: string, body: string): Promise<void>;
}

/** Development channel: logs the message (recipient partly masked). */
export class ConsoleNotificationChannel implements NotificationChannel {
  readonly name = 'console' as const;
  private readonly logger = new Logger('Notifications');

  async send(recipient: string, body: string): Promise<void> {
    this.logger.log(`DEV ONLY — message to ${recipient.slice(0, 7)}…: ${body}`);
  }
}
