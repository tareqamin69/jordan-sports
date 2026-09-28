import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PlatformRole } from '@jordan-sports/contracts';
import type { Actor } from '../../../platform/auth/actor.js';
import type { AppConfig } from '../../../platform/config/config.js';
import { APP_CONFIG } from '../../../platform/config/config.module.js';
import type { Db, DbOrTx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { RateLimiter } from '../../../platform/redis/rate-limiter.js';
import {
  decryptSecret,
  encryptSecret,
  hmacHex,
  randomToken,
  safeEqualHex,
  sha256Hex,
} from '../../../platform/security/crypto.js';
import {
  hashPassword,
  isAcceptablePassword,
  verifyPassword,
} from '../../../platform/security/passwords.js';
import { generateTotpSecret, verifyTotp } from '../../../platform/security/totp.js';
import { AuditService } from '../../audit/index.js';
import { normalizePhone } from '../domain/phone.js';
import { OTP_SENDER, type OtpSender } from './otp-sender.js';

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const SIGNUP_TOKEN_TTL_SECONDS = 15 * 60;
export const WEB_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
const LAST_SEEN_RESOLUTION_MS = 5 * 60 * 1000;
const TOTP_PURPOSE = 'totp-secret';

export const rateLimits = {
  otpPhoneBurst: { name: 'otp.request.phone.burst', limit: 1, windowSeconds: 30 },
  otpPhoneHourly: { name: 'otp.request.phone.hour', limit: 5, windowSeconds: 3600 },
  otpIpHourly: { name: 'otp.request.ip.hour', limit: 30, windowSeconds: 3600 },
  otpVerifyIp: { name: 'otp.verify.ip', limit: 60, windowSeconds: 600 },
  adminSignInIp: { name: 'admin.signin.ip', limit: 10, windowSeconds: 900 },
  adminSignInEmail: { name: 'admin.signin.email', limit: 10, windowSeconds: 900 },
} as const;

export type VerifyResult =
  | { readonly status: 'signed_in'; readonly userId: string; readonly sessionToken: string }
  | { readonly status: 'profile_required'; readonly signupToken: string };

export interface IssuedSession {
  readonly userId: string;
  readonly sessionToken: string;
}

// A valid Argon2id hash of a random value, verified when the email is unknown so that response
// time does not reveal whether an admin account exists.
let dummyHash: Promise<string> | undefined;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(OTP_SENDER) private readonly otpSender: OtpSender,
    private readonly rateLimiter: RateLimiter,
    private readonly audit: AuditService,
  ) {}

  private phoneOrThrow(input: string): string {
    const phone = normalizePhone(input);
    if (!phone) throw new AppError('INVALID_PHONE', 400);
    return phone;
  }

  private codeHash(challengeId: string, code: string): string {
    return hmacHex(this.config.authSecret, `otp:${challengeId}:${code}`);
  }

  // ------------------------------------------------------------------------------------------
  // Phone OTP
  // ------------------------------------------------------------------------------------------

  async requestOtp(
    phoneInput: string,
    locale: 'ar' | 'en',
    meta: RequestMeta,
  ): Promise<{ phone: string; expiresInSeconds: number }> {
    const phone = this.phoneOrThrow(phoneInput);
    await this.rateLimiter.enforce([
      [rateLimits.otpPhoneBurst, phone],
      [rateLimits.otpPhoneHourly, phone],
      [rateLimits.otpIpHourly, meta.ip ?? 'unknown'],
    ]);

    const id = uuidv7();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.db
      .insertInto('identity.otp_challenges')
      .values({
        id,
        phone,
        code_hash: this.codeHash(id, code),
        expires_at: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      })
      .execute();
    await this.otpSender.send(phone, code, locale);
    return { phone, expiresInSeconds: OTP_TTL_SECONDS };
  }

  async verifyOtp(phoneInput: string, code: string, meta: RequestMeta): Promise<VerifyResult> {
    const phone = this.phoneOrThrow(phoneInput);
    await this.rateLimiter.enforce([[rateLimits.otpVerifyIp, meta.ip ?? 'unknown']]);

    // The attempt counter must persist even when verification fails, so failures are returned
    // from the transaction and thrown after it commits.
    type Outcome =
      | { error: 'OTP_EXPIRED' | 'OTP_TOO_MANY_ATTEMPTS' | 'OTP_INVALID' | 'ACCOUNT_SUSPENDED' }
      | { result: VerifyResult };
    const outcome = await this.db.transaction().execute(async (tx): Promise<Outcome> => {
      const challenge = await tx
        .selectFrom('identity.otp_challenges')
        .select(['id', 'code_hash', 'attempts', 'expires_at', 'verified_at'])
        .where('phone', '=', phone)
        .orderBy('created_at', 'desc')
        .limit(1)
        .forUpdate()
        .executeTakeFirst();

      if (!challenge || challenge.verified_at || challenge.expires_at.getTime() <= Date.now()) {
        return { error: 'OTP_EXPIRED' as const };
      }
      if (challenge.attempts >= OTP_MAX_ATTEMPTS)
        return { error: 'OTP_TOO_MANY_ATTEMPTS' as const };
      if (!safeEqualHex(challenge.code_hash, this.codeHash(challenge.id, code))) {
        await tx
          .updateTable('identity.otp_challenges')
          .set({ attempts: challenge.attempts + 1 })
          .where('id', '=', challenge.id)
          .execute();
        return {
          error:
            challenge.attempts + 1 >= OTP_MAX_ATTEMPTS
              ? ('OTP_TOO_MANY_ATTEMPTS' as const)
              : ('OTP_INVALID' as const),
        };
      }

      const user = await tx
        .selectFrom('identity.users')
        .select(['id', 'status', 'age_confirmed_at'])
        .where('phone', '=', phone)
        .executeTakeFirst();
      if (user?.status === 'suspended') return { error: 'ACCOUNT_SUSPENDED' as const };

      if (user?.age_confirmed_at) {
        await tx
          .updateTable('identity.otp_challenges')
          .set({ verified_at: new Date(), signup_completed_at: new Date() })
          .where('id', '=', challenge.id)
          .execute();
        const sessionToken = await this.createSession(user.id, 'web', meta, tx);
        return { result: { status: 'signed_in' as const, userId: user.id, sessionToken } };
      }

      // New phone, or an account pre-created by an admin that has never completed sign-up.
      const signupToken = randomToken();
      await tx
        .updateTable('identity.otp_challenges')
        .set({ verified_at: new Date(), signup_token_hash: sha256Hex(signupToken) })
        .where('id', '=', challenge.id)
        .execute();
      return { result: { status: 'profile_required' as const, signupToken } };
    });

    if ('error' in outcome) {
      throw new AppError(outcome.error, outcome.error === 'ACCOUNT_SUSPENDED' ? 403 : 400);
    }
    return outcome.result;
  }

  async completeSignup(
    signupToken: string,
    profile: { displayName: string; locale: 'ar' | 'en'; preferredMode: 'player' | 'venue' },
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    return this.db.transaction().execute(async (tx) => {
      const challenge = await tx
        .selectFrom('identity.otp_challenges')
        .select(['id', 'phone', 'verified_at', 'signup_completed_at'])
        .where('signup_token_hash', '=', sha256Hex(signupToken))
        .forUpdate()
        .executeTakeFirst();
      if (
        !challenge?.verified_at ||
        challenge.signup_completed_at ||
        challenge.verified_at.getTime() + SIGNUP_TOKEN_TTL_SECONDS * 1000 <= Date.now()
      ) {
        throw new AppError('SIGNUP_TOKEN_INVALID', 400);
      }

      const now = new Date();
      const existing = await tx
        .selectFrom('identity.users')
        .select(['id', 'status'])
        .where('phone', '=', challenge.phone)
        .forUpdate()
        .executeTakeFirst();
      if (existing?.status === 'suspended') throw new AppError('ACCOUNT_SUSPENDED', 403);

      let userId: string;
      if (existing) {
        userId = existing.id;
        await tx
          .updateTable('identity.users')
          .set({
            display_name: profile.displayName,
            locale: profile.locale,
            preferred_mode: profile.preferredMode,
            age_confirmed_at: now,
          })
          .where('id', '=', userId)
          .execute();
      } else {
        userId = uuidv7();
        await tx
          .insertInto('identity.users')
          .values({
            id: userId,
            phone: challenge.phone,
            display_name: profile.displayName,
            locale: profile.locale,
            preferred_mode: profile.preferredMode,
            age_confirmed_at: now,
          })
          .execute();
      }
      await tx
        .updateTable('identity.otp_challenges')
        .set({ signup_completed_at: now })
        .where('id', '=', challenge.id)
        .execute();
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: userId,
          action: 'user.signed_up',
          targetType: 'user',
          targetId: userId,
          details: { ageConfirmed: true },
          meta,
        },
        tx,
      );
      const sessionToken = await this.createSession(userId, 'web', meta, tx);
      return { userId, sessionToken };
    });
  }

  // ------------------------------------------------------------------------------------------
  // Sessions
  // ------------------------------------------------------------------------------------------

  async createSession(
    userId: string,
    kind: 'web' | 'admin',
    meta: RequestMeta,
    db: DbOrTx = this.db,
  ): Promise<string> {
    const token = randomToken();
    const ttl = kind === 'admin' ? ADMIN_SESSION_TTL_SECONDS : WEB_SESSION_TTL_SECONDS;
    await db
      .insertInto('identity.sessions')
      .values({
        id: uuidv7(),
        user_id: userId,
        kind,
        token_hash: sha256Hex(token),
        expires_at: new Date(Date.now() + ttl * 1000),
        ip: meta.ip,
        user_agent: meta.userAgent,
      })
      .execute();
    return token;
  }

  /** Resolves a session cookie to an actor, or null when missing/expired/revoked/suspended. */
  async resolveSession(token: string, kind: 'web' | 'admin'): Promise<Actor | null> {
    if (!token || token.length > 200) return null;
    const row = await this.db
      .selectFrom('identity.sessions as s')
      .innerJoin('identity.users as u', 'u.id', 's.user_id')
      .select(['s.id', 's.user_id', 's.last_seen_at', 'u.platform_role'])
      .where('s.token_hash', '=', sha256Hex(token))
      .where('s.kind', '=', kind)
      .where('s.revoked_at', 'is', null)
      .where('s.expires_at', '>', new Date())
      .where('u.status', '=', 'active')
      .executeTakeFirst();
    if (!row) return null;

    if (Date.now() - row.last_seen_at.getTime() > LAST_SEEN_RESOLUTION_MS) {
      await this.db
        .updateTable('identity.sessions')
        .set({ last_seen_at: new Date() })
        .where('id', '=', row.id)
        .execute();
    }
    if (kind === 'admin') {
      if (!row.platform_role) return null;
      return {
        kind: 'admin',
        userId: row.user_id,
        sessionId: row.id,
        platformRole: row.platform_role as PlatformRole,
      };
    }
    return { kind: 'user', userId: row.user_id, sessionId: row.id };
  }

  async revokeSession(token: string): Promise<void> {
    if (!token) return;
    await this.db
      .updateTable('identity.sessions')
      .set({ revoked_at: new Date() })
      .where('token_hash', '=', sha256Hex(token))
      .where('revoked_at', 'is', null)
      .execute();
  }

  // ------------------------------------------------------------------------------------------
  // Platform staff (admin)
  // ------------------------------------------------------------------------------------------

  async adminSignIn(
    email: string,
    password: string,
    totpCode: string,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const normalizedEmail = email.trim().toLowerCase();
    await this.rateLimiter.enforce([
      [rateLimits.adminSignInIp, meta.ip ?? 'unknown'],
      [rateLimits.adminSignInEmail, normalizedEmail],
    ]);

    const user = await this.db
      .selectFrom('identity.users as u')
      .innerJoin('identity.password_credentials as p', 'p.user_id', 'u.id')
      .innerJoin('identity.totp_credentials as t', 't.user_id', 'u.id')
      .select([
        'u.id',
        'u.status',
        'u.platform_role',
        'p.password_hash',
        't.secret_encrypted',
        't.last_used_step',
      ])
      .where('u.email', '=', normalizedEmail)
      .where('u.platform_role', 'is not', null)
      .executeTakeFirst();

    if (!user) {
      dummyHash ??= hashPassword(randomToken());
      await verifyPassword(await dummyHash, password);
      throw new AppError('INVALID_CREDENTIALS', 401);
    }
    if (!(await verifyPassword(user.password_hash, password))) {
      throw new AppError('INVALID_CREDENTIALS', 401);
    }
    const secret = decryptSecret(this.config.authSecret, TOTP_PURPOSE, user.secret_encrypted);
    const step = verifyTotp(secret, totpCode);
    if (step === null || step <= Number(user.last_used_step)) {
      throw new AppError('INVALID_CREDENTIALS', 401);
    }
    if (user.status !== 'active') throw new AppError('ACCOUNT_SUSPENDED', 403);

    return this.db.transaction().execute(async (tx) => {
      // Conditional update: a code (time step) can be used only once, even concurrently.
      const accepted = await tx
        .updateTable('identity.totp_credentials')
        .set({ last_used_step: String(step) })
        .where('user_id', '=', user.id)
        .where('last_used_step', '<', String(step))
        .executeTakeFirst();
      if (Number(accepted.numUpdatedRows) !== 1) throw new AppError('INVALID_CREDENTIALS', 401);

      const sessionToken = await this.createSession(user.id, 'admin', meta, tx);
      await this.audit.record(
        { actorType: 'admin', actorUserId: user.id, action: 'admin.signed_in', meta },
        tx,
      );
      return { userId: user.id, sessionToken };
    });
  }

  /** Creates a platform staff account. Returns the TOTP secret to enrol in an authenticator. */
  async createPlatformUser(input: {
    email: string;
    displayName: string;
    password: string;
    role: PlatformRole;
    /** Provisioning only (e.g. staging bootstrap); generated when omitted. */
    totpSecret?: string;
  }): Promise<{ userId: string; totpSecret: string }> {
    if (!isAcceptablePassword(input.password)) {
      throw new AppError('VALIDATION_FAILED', 400, 'Password must be 12–200 characters');
    }
    if (input.totpSecret !== undefined && !/^[A-Z2-7]{32,}$/.test(input.totpSecret)) {
      throw new AppError('VALIDATION_FAILED', 400, 'TOTP secret must be base32 (32+ characters)');
    }
    const totpSecret = input.totpSecret ?? generateTotpSecret();
    const userId = uuidv7();
    const passwordHash = await hashPassword(input.password);
    await this.db.transaction().execute(async (tx) => {
      await tx
        .insertInto('identity.users')
        .values({
          id: userId,
          email: input.email.trim().toLowerCase(),
          display_name: input.displayName,
          platform_role: input.role,
          locale: 'en',
        })
        .execute();
      await tx
        .insertInto('identity.password_credentials')
        .values({ user_id: userId, password_hash: passwordHash })
        .execute();
      await tx
        .insertInto('identity.totp_credentials')
        .values({
          user_id: userId,
          secret_encrypted: encryptSecret(this.config.authSecret, TOTP_PURPOSE, totpSecret),
        })
        .execute();
      await this.audit.record(
        {
          actorType: 'system',
          action: 'admin.created',
          targetType: 'user',
          targetId: userId,
          details: { role: input.role },
        },
        tx,
      );
    });
    return { userId, totpSecret };
  }

  async adminProfile(userId: string) {
    const user = await this.db
      .selectFrom('identity.users')
      .select(['id', 'email', 'display_name', 'platform_role'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user?.platform_role || !user.email) throw Errors.unauthenticated();
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      platformRole: user.platform_role as PlatformRole,
    };
  }
}
