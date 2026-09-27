import { Controller, Get, Inject, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../../platform/auth/decorators.js';
import { Errors } from '../../../platform/http/errors.js';
import { parseInput } from '../../../platform/http/validation.js';
import { ConsoleOtpSender, OTP_SENDER, type OtpSender } from '../application/otp-sender.js';
import { normalizePhone } from '../domain/phone.js';

/**
 * DEVELOPMENT ONLY. Returns the latest code sent through the console OTP channel so developers
 * and e2e tests can sign in without an SMS provider. This controller is only registered when the
 * console channel is configured, which the configuration refuses in production.
 */
@Controller()
export class DevOtpController {
  constructor(@Inject(OTP_SENDER) private readonly sender: OtpSender) {}

  @Get('/v1/dev/otp')
  @Public()
  latest(@Query() query: unknown): { code: string; sentAt: string } {
    const { phone } = parseInput(z.object({ phone: z.string().max(20) }), query);
    const normalized = normalizePhone(phone);
    const entry =
      this.sender instanceof ConsoleOtpSender && normalized
        ? this.sender.latestFor(normalized)
        : undefined;
    if (!entry) throw Errors.notFound();
    return { code: entry.code, sentAt: entry.sentAt.toISOString() };
  }
}
