import { Inject, Injectable } from '@nestjs/common';
import type { AccountSetup, PlatformRole } from '@jordan-sports/contracts';
import type { AppConfig } from '../../../platform/config/config.js';
import { APP_CONFIG } from '../../../platform/config/config.module.js';
import type { Db, Tx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { AppError } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { RateLimiter } from '../../../platform/redis/rate-limiter.js';
import {
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256Hex,
} from '../../../platform/security/crypto.js';
import { hashPassword, isAcceptablePassword } from '../../../platform/security/passwords.js';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../../../platform/security/totp.js';
import { AuditService } from '../../audit/index.js';
import { AuthService, TOTP_PURPOSE, rateLimits, type IssuedAdminSession } from './auth.service.js';

/** The owner's setup link is short-lived (docs/rbac-plan.md §6); staff invitations last 2 days. */
export const OWNER_SETUP_TTL_MS = 30 * 60 * 1000;
export const STAFF_INVITE_TTL_MS = 48 * 60 * 60 * 1000;

export type SetupPurpose = 'owner_setup' | 'staff_invite';

export class OwnerExistsError extends Error {
  override readonly name = 'OwnerExistsError';
}

/**
 * One-time links for platform staff to choose their own password and enrol an authenticator.
 * No password ever passes through configuration, the command line or chat: the owner's link is
 * generated on the server (owner-setup-link.js), staff invitations by the owner.
 */
@Injectable()
export class StaffSetupService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly auth: AuthService,
    private readonly rateLimiter: RateLimiter,
    private readonly audit: AuditService,
  ) {}

  /** Creates a link token (returned once, stored hashed). Earlier unused links for the email stop working. */
  async createLink(input: {
    purpose: SetupPurpose;
    email: string;
    role: PlatformRole;
    displayName?: string | null;
    replaceOwner?: boolean;
    createdBy?: string | null;
    meta?: RequestMeta;
  }): Promise<{ token: string; expiresAt: Date; id: string }> {
    const email = input.email.trim().toLowerCase();
    if ((input.purpose === 'owner_setup') !== (input.role === 'owner')) {
      throw new AppError('VALIDATION_FAILED', 400, 'Only the owner setup link sets up the owner');
    }
    const token = randomToken();
    const id = uuidv7();
    const expiresAt = new Date(
      Date.now() + (input.purpose === 'owner_setup' ? OWNER_SETUP_TTL_MS : STAFF_INVITE_TTL_MS),
    );
    await this.db.transaction().execute(async (tx) => {
      if (input.purpose === 'owner_setup' && !input.replaceOwner) {
        const owner = await tx
          .selectFrom('identity.users')
          .select('email')
          .where('platform_role', '=', 'owner')
          .executeTakeFirst();
        if (owner && owner.email?.toLowerCase() !== email) {
          throw new OwnerExistsError(
            'An owner account already exists with another email. Use --replace-owner to hand over ownership.',
          );
        }
      }
      await tx
        .updateTable('identity.account_setup_tokens')
        .set({ revoked_at: new Date() })
        .where('email', '=', email)
        .where('used_at', 'is', null)
        .where('revoked_at', 'is', null)
        .execute();
      await tx
        .insertInto('identity.account_setup_tokens')
        .values({
          id,
          purpose: input.purpose,
          email,
          display_name: input.displayName ?? null,
          platform_role: input.role,
          replace_owner: input.replaceOwner ?? false,
          token_hash: sha256Hex(token),
          totp_secret_encrypted: encryptSecret(
            this.config.authSecret,
            TOTP_PURPOSE,
            generateTotpSecret(),
          ),
          expires_at: expiresAt,
          created_by: input.createdBy ?? null,
        })
        .execute();
      await this.audit.record(
        {
          actorType: input.createdBy ? 'admin' : 'system',
          actorUserId: input.createdBy ?? null,
          action:
            input.purpose === 'owner_setup' ? 'admin.owner_setup_link_created' : 'admin.invited',
          targetType: 'setup_link',
          targetId: id,
          details: { email, role: input.role, replaceOwner: input.replaceOwner ?? false },
          ...(input.meta ? { meta: input.meta } : {}),
        },
        tx,
      );
    });
    return { token, expiresAt, id };
  }

  private async usableLink(db: Db | Tx, token: string, forUpdate: boolean) {
    let query = db
      .selectFrom('identity.account_setup_tokens')
      .selectAll()
      .where('token_hash', '=', sha256Hex(token))
      .where('used_at', 'is', null)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date());
    if (forUpdate) query = query.forUpdate();
    const link = await query.executeTakeFirst();
    if (!link) throw new AppError('SETUP_LINK_INVALID', 400);
    return link;
  }

  async inspect(token: string, meta: RequestMeta): Promise<AccountSetup> {
    await this.rateLimiter.enforce([[rateLimits.adminSignInIp, meta.ip ?? 'unknown']]);
    const link = await this.usableLink(this.db, token, false);
    const secret = decryptSecret(this.config.authSecret, TOTP_PURPOSE, link.totp_secret_encrypted);
    return {
      email: link.email,
      displayName: link.display_name,
      platformRole: link.platform_role as PlatformRole,
      totpSecret: secret,
      otpauthUri: otpauthUri(secret, link.email),
      expiresAt: link.expires_at.toISOString(),
    };
  }

  /**
   * Sets the password and authenticator from a link and signs the staff member in. Using an
   * owner link for an existing account resets its credentials (and ends its sessions).
   */
  async complete(
    input: { token: string; displayName: string; password: string; totpCode: string },
    meta: RequestMeta,
    deviceToken: string | null,
  ): Promise<IssuedAdminSession> {
    await this.rateLimiter.enforce([[rateLimits.adminSignInIp, meta.ip ?? 'unknown']]);
    if (!isAcceptablePassword(input.password)) {
      throw new AppError('VALIDATION_FAILED', 400, 'Password must be 12–200 characters');
    }
    const passwordHash = await hashPassword(input.password);
    return this.db.transaction().execute(async (tx) => {
      const link = await this.usableLink(tx, input.token, true);
      const secret = decryptSecret(
        this.config.authSecret,
        TOTP_PURPOSE,
        link.totp_secret_encrypted,
      );
      const step = verifyTotp(secret, input.totpCode);
      if (step === null) throw new AppError('INVALID_CREDENTIALS', 401);
      const role = link.platform_role as PlatformRole;

      if (role === 'owner') {
        const current = await tx
          .selectFrom('identity.users')
          .select(['id', 'email'])
          .where('platform_role', '=', 'owner')
          .forUpdate()
          .executeTakeFirst();
        if (current && current.email?.toLowerCase() !== link.email.toLowerCase()) {
          if (!link.replace_owner) throw new AppError('SETUP_LINK_INVALID', 400);
          await tx
            .updateTable('identity.users')
            .set({ platform_role: 'admin' })
            .where('id', '=', current.id)
            .execute();
          await this.revokeSessions(tx, current.id);
          await this.audit.record(
            {
              actorType: 'system',
              action: 'admin.owner_replaced',
              targetType: 'user',
              targetId: current.id,
              details: { before: { role: 'owner' }, after: { role: 'admin' } },
              meta,
            },
            tx,
          );
        }
      }

      const existing = await tx
        .selectFrom('identity.users')
        .select(['id', 'platform_role'])
        .where('email', '=', link.email)
        .forUpdate()
        .executeTakeFirst();
      // Platform staff accounts are separate from player accounts (docs/rbac-plan.md §1).
      if (existing && !existing.platform_role) {
        throw new AppError('VALIDATION_FAILED', 400, 'This email belongs to a player account');
      }
      const encrypted = encryptSecret(this.config.authSecret, TOTP_PURPOSE, secret);
      let userId: string;
      if (existing) {
        userId = existing.id;
        await tx
          .updateTable('identity.users')
          .set({
            platform_role: role,
            display_name: input.displayName,
            status: 'active',
            failed_sign_ins: 0,
            locked_until: null,
          })
          .where('id', '=', userId)
          .execute();
        await this.revokeSessions(tx, userId);
      } else {
        userId = uuidv7();
        await tx
          .insertInto('identity.users')
          .values({
            id: userId,
            email: link.email,
            display_name: input.displayName,
            platform_role: role,
            locale: 'ar',
          })
          .execute();
      }
      await tx
        .insertInto('identity.password_credentials')
        .values({ user_id: userId, password_hash: passwordHash })
        .onConflict((oc) =>
          oc.column('user_id').doUpdateSet({ password_hash: passwordHash, updated_at: new Date() }),
        )
        .execute();
      await tx
        .insertInto('identity.totp_credentials')
        .values({ user_id: userId, secret_encrypted: encrypted, last_used_step: String(step) })
        .onConflict((oc) =>
          oc
            .column('user_id')
            .doUpdateSet({ secret_encrypted: encrypted, last_used_step: String(step) }),
        )
        .execute();
      await tx
        .updateTable('identity.account_setup_tokens')
        .set({ used_at: new Date() })
        .where('id', '=', link.id)
        .execute();
      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: userId,
          action: 'admin.account_setup_completed',
          targetType: 'user',
          targetId: userId,
          details: {
            purpose: link.purpose,
            before: existing ? { role: existing.platform_role } : null,
            after: { role },
          },
          meta,
        },
        tx,
      );
      const session = await this.auth.startAdminSession(tx, userId, meta, deviceToken);
      return { userId, ...session };
    });
  }

  private async revokeSessions(tx: Tx, userId: string): Promise<void> {
    await tx
      .updateTable('identity.sessions')
      .set({ revoked_at: new Date() })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
  }
}
