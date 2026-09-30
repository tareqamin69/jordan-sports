import { Logger } from '@nestjs/common';
import { BRAND_NAME } from '@jordan-sports/brand';
import { maskPhone, ReleansClient } from '../../../platform/sms/releans.js';
import type { OtpSender } from './otp-sender.js';

/** Sign-in codes by SMS through Releans. The code is never logged. */
export class ReleansOtpSender implements OtpSender {
  private readonly logger = new Logger('ReleansOtpSender');

  constructor(private readonly client: ReleansClient) {}

  async send(phone: string, code: string, locale: 'ar' | 'en'): Promise<void> {
    const text =
      locale === 'ar'
        ? `كود الدخول لـ${BRAND_NAME.ar}: ${code}\nلا تعطيه لحدا.`
        : `Your ${BRAND_NAME.en} sign-in code: ${code}\nDo not share it with anyone.`;
    try {
      await this.client.send(phone, text);
    } catch (error) {
      this.logger.error(`Could not send a sign-in code to ${maskPhone(phone)}: ${String(error)}`);
      throw error;
    }
  }
}
