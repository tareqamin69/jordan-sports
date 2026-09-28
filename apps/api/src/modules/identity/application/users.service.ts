import { Inject, Injectable } from '@nestjs/common';
import type { AdminUser } from '@jordan-sports/contracts';
import type { Db, DbOrTx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';

export interface UserRow {
  id: string;
  phone: string | null;
  email: string | null;
  display_name: string | null;
  locale: string;
  preferred_mode: string;
  status: string;
  platform_role: string | null;
  created_at: Date;
}

const userColumns = [
  'id',
  'phone',
  'email',
  'display_name',
  'locale',
  'preferred_mode',
  'status',
  'platform_role',
  'created_at',
] as const;

export function toAdminUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    phone: row.phone,
    email: row.email,
    displayName: row.display_name,
    status: row.status as AdminUser['status'],
    platformRole: row.platform_role as AdminUser['platformRole'],
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async findById(id: string, db: DbOrTx = this.db): Promise<UserRow | undefined> {
    return db
      .selectFrom('identity.users')
      .select(userColumns)
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findByPhone(phone: string, db: DbOrTx = this.db): Promise<UserRow | undefined> {
    return db
      .selectFrom('identity.users')
      .select(userColumns)
      .where('phone', '=', phone)
      .executeTakeFirst();
  }

  /**
   * Returns the user with this phone, creating a placeholder account (name only, no age
   * confirmation yet) when needed — used when admins add venue staff before their first sign-in.
   */
  async findOrCreateByPhone(phone: string, displayName: string, db: DbOrTx): Promise<UserRow> {
    const existing = await this.findByPhone(phone, db);
    if (existing) return existing;
    return db
      .insertInto('identity.users')
      .values({ id: uuidv7(), phone, display_name: displayName })
      .onConflict((oc) => oc.column('phone').doUpdateSet({ phone }))
      .returning(userColumns)
      .executeTakeFirstOrThrow();
  }

  async updateProfile(
    userId: string,
    patch: { displayName?: string; locale?: 'ar' | 'en' },
  ): Promise<void> {
    if (patch.displayName === undefined && patch.locale === undefined) return;
    await this.db
      .updateTable('identity.users')
      .set({
        ...(patch.displayName !== undefined ? { display_name: patch.displayName } : {}),
        ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
      })
      .where('id', '=', userId)
      .execute();
  }

  async adminList(options: { limit: number; cursor?: string; q?: string }) {
    let query = this.db
      .selectFrom('identity.users')
      .select(userColumns)
      .orderBy('id', 'desc')
      .limit(options.limit + 1);
    if (options.cursor) query = query.where('id', '<', options.cursor);
    if (options.q) {
      const like = `%${options.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      query = query.where((eb) =>
        eb.or([
          eb('display_name', 'ilike', like),
          eb('phone', 'like', like),
          eb('email', 'ilike', like),
        ]),
      );
    }
    const rows = await query.execute();
    const items = rows.slice(0, options.limit).map(toAdminUser);
    return { items, nextCursor: rows.length > options.limit ? items.at(-1)!.id : null };
  }

  async adminSetStatus(
    adminUserId: string,
    userId: string,
    status: 'active' | 'suspended',
    reason: string,
    meta: RequestMeta,
  ): Promise<AdminUser> {
    if (adminUserId === userId) throw Errors.forbidden();
    return this.db.transaction().execute(async (tx) => {
      const user = await tx
        .updateTable('identity.users')
        .set({ status })
        .where('id', '=', userId)
        .returning(userColumns)
        .executeTakeFirst();
      if (!user) throw Errors.notFound();
      if (status === 'suspended') {
        await tx
          .updateTable('identity.sessions')
          .set({ revoked_at: new Date() })
          .where('user_id', '=', userId)
          .where('revoked_at', 'is', null)
          .execute();
      }
      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: adminUserId,
          action: status === 'suspended' ? 'user.suspended' : 'user.reactivated',
          targetType: 'user',
          targetId: userId,
          reason,
          meta,
        },
        tx,
      );
      return toAdminUser(user);
    });
  }
}
