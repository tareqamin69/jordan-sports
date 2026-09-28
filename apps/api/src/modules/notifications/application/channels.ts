import { Logger } from '@nestjs/common';
import type { ReleansClient } from '../../../platform/sms/releans.js';

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

/** Booking messages by SMS through Releans (ADR-0019). Failures are retried by the outbox. */
export class ReleansNotificationChannel implements NotificationChannel {
  readonly name = 'sms' as const;

  constructor(private readonly client: ReleansClient) {}

  async send(recipient: string, body: string): Promise<void> {
    await this.client.send(recipient, body);
  }
}
