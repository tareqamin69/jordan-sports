import { Logger } from '@nestjs/common';

export const OTP_SENDER = Symbol('OTP_SENDER');

/** Delivers one-time codes. Real SMS/WhatsApp providers implement this (provider TBD). */
export interface OtpSender {
  send(phone: string, code: string, locale: 'ar' | 'en'): Promise<void>;
}

/**
 * Development-only channel (ADR-0009): logs that a code was sent and keeps the latest code per
 * phone in memory so local testing and e2e tests can read it through the dev-only endpoint.
 * The configuration refuses this channel in production.
 */
export class ConsoleOtpSender implements OtpSender {
  private readonly logger = new Logger('ConsoleOtpSender');
  private readonly latest = new Map<string, { code: string; sentAt: Date }>();

  async send(phone: string, code: string): Promise<void> {
    this.latest.set(phone, { code, sentAt: new Date() });
    // Development only: the code is printed so a developer can sign in locally.
    this.logger.log(`DEV ONLY — sign-in code for ${phone.slice(0, 7)}…: ${code}`);
  }

  latestFor(phone: string): { code: string; sentAt: Date } | undefined {
    return this.latest.get(phone);
  }
}
