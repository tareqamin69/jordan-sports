import { Inject, Injectable } from '@nestjs/common';
import type { UserDataExport } from '@jordan-sports/contracts';
import { sql } from 'kysely';
import type { Db } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { bypassTenant } from '../../../platform/database/tenant.js';
import { transaction } from '../../../platform/database/transaction.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';
import { recordConsent } from '../../identity/index.js';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * Personal-data rights (Jordan PDPL No. 24/2023, docs/compliance-checklist.md): marketing
 * preference, deleting an account, and exporting everything stored about a user.
 */
@Injectable()
export class PrivacyService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async setMarketing(userId: string, optIn: boolean): Promise<void> {
    await transaction(this.db, async (tx) => {
      const user = await tx
        .selectFrom('identity.users')
        .select('marketing_opt_in_at')
        .where('id', '=', userId)
        .forUpdate()
        .executeTakeFirst();
      if (!user) throw Errors.notFound();
      if (optIn === (user.marketing_opt_in_at !== null)) return;
      await tx
        .updateTable('identity.users')
        .set({ marketing_opt_in_at: optIn ? new Date() : null })
        .where('id', '=', userId)
        .execute();
      await recordConsent(tx, { userId, kind: optIn ? 'marketing_opt_in' : 'marketing_opt_out' });
    });
  }

  /**
   * Deletes an account: name, phone and e-mail are removed at once and every session ends. The
   * row stays so bookings and payments keep a reference (accounting); they no longer point to a
   * person. Refused while the user has upcoming bookings or owns a venue, or is platform staff.
   */
  async deleteAccount(userId: string, meta: RequestMeta): Promise<void> {
    await transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      const user = await tx
        .selectFrom('identity.users')
        .select(['id', 'phone', 'status', 'platform_role', 'deleted_at'])
        .where('id', '=', userId)
        .forUpdate()
        .executeTakeFirst();
      if (!user || user.deleted_at) throw Errors.notFound();
      if (user.platform_role) throw Errors.forbidden();

      const upcoming = await tx
        .selectFrom('booking.bookings')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('customer_user_id', '=', userId)
        .where('status', 'in', ['HELD', 'CONFIRMED'])
        .where(sql<boolean>`upper(during) > now()`)
        .executeTakeFirstOrThrow();
      if (Number(upcoming.n) > 0) throw new AppError('ACCOUNT_HAS_UPCOMING_BOOKINGS', 409);

      const owner = await tx
        .selectFrom('tenancy.memberships')
        .select('id')
        .where('user_id', '=', userId)
        .where('role', '=', 'owner')
        .executeTakeFirst();
      if (owner) throw new AppError('ACCOUNT_RUNS_VENUE', 409);

      await tx.deleteFrom('tenancy.memberships').where('user_id', '=', userId).execute();
      await tx
        .updateTable('identity.sessions')
        .set({ revoked_at: new Date() })
        .where('user_id', '=', userId)
        .where('revoked_at', 'is', null)
        .execute();
      await tx
        .updateTable('identity.sessions')
        .set({ ip: null, user_agent: null })
        .where('user_id', '=', userId)
        .execute();
      if (user.phone) {
        await tx.deleteFrom('identity.otp_challenges').where('phone', '=', user.phone).execute();
      }
      await tx
        .updateTable('identity.users')
        .set({
          status: 'deleted',
          deleted_at: new Date(),
          phone: null,
          email: null,
          display_name: null,
          marketing_opt_in_at: null,
        })
        .where('id', '=', userId)
        .execute();
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: userId,
          action: 'user.deleted',
          targetType: 'user',
          targetId: userId,
          meta,
        },
        tx,
      );
    });
  }

  /** Everything stored about one user (access requests). Audited. */
  async exportData(
    actor: { userId: string; meta: RequestMeta },
    userId: string,
  ): Promise<UserDataExport> {
    return transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      const u = await tx
        .selectFrom('identity.users')
        .select([
          'id',
          'phone',
          'email',
          'display_name',
          'locale',
          'preferred_mode',
          'status',
          'age_confirmed_at',
          'terms_version',
          'terms_accepted_at',
          'marketing_opt_in_at',
          'deleted_at',
          'created_at',
        ])
        .where('id', '=', userId)
        .executeTakeFirst();
      if (!u) throw Errors.notFound();

      const consents = await tx
        .selectFrom('identity.consents as c')
        .leftJoin('booking.bookings as b', 'b.id', 'c.booking_id')
        .select(['c.kind', 'c.version', 'c.created_at', 'b.reference as booking_reference'])
        .where('c.user_id', '=', userId)
        .orderBy('c.created_at')
        .execute();
      const memberships = await tx
        .selectFrom('tenancy.memberships as m')
        .innerJoin('tenancy.organizations as o', 'o.id', 'm.organization_id')
        .select(['o.name as organization', 'm.role', 'm.created_at'])
        .where('m.user_id', '=', userId)
        .execute();
      const bookings = await tx
        .selectFrom('booking.bookings as b')
        .innerJoin('venue.venues as v', 'v.id', 'b.venue_id')
        .select([
          'b.id',
          'b.reference',
          'v.name as venue',
          sql<string>`lower(b.during)::text`.as('starts_at'),
          'b.status',
          'b.total',
          'b.currency',
          'b.payment_status',
          'b.created_at',
          'b.cancelled_at',
        ])
        .where('b.customer_user_id', '=', userId)
        .orderBy('b.created_at')
        .execute();
      const bookingIds = bookings.map((b) => b.id);
      const payments = bookingIds.length
        ? await tx
            .selectFrom('payment.transactions as t')
            .innerJoin('booking.bookings as b', 'b.id', 't.booking_id')
            .select([
              'b.reference as booking_reference',
              't.kind',
              't.status',
              't.amount',
              't.currency',
              't.card_brand',
              't.card_last4',
              't.reason',
              't.created_at',
              't.completed_at',
            ])
            .where('t.booking_id', 'in', bookingIds)
            .orderBy('t.created_at')
            .execute()
        : [];
      const complaints = await tx
        .selectFrom('support.complaints')
        .select(['reference', 'category', 'status', 'body', 'created_at', 'resolved_at'])
        .where('reporter_user_id', '=', userId)
        .orderBy('created_at')
        .execute();

      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: actor.userId,
          action: 'user.data_exported',
          targetType: 'user',
          targetId: userId,
          meta: actor.meta,
        },
        tx,
      );

      const rows = <T extends Record<string, unknown>>(list: T[]) =>
        list.map((r) =>
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]),
          ),
        );
      return {
        exportedAt: new Date().toISOString(),
        profile: {
          id: u.id,
          phone: u.phone,
          email: u.email,
          displayName: u.display_name,
          locale: u.locale,
          preferredMode: u.preferred_mode,
          status: u.status,
          ageConfirmedAt: iso(u.age_confirmed_at),
          termsVersion: u.terms_version,
          termsAcceptedAt: iso(u.terms_accepted_at),
          marketingOptInAt: iso(u.marketing_opt_in_at),
          deletedAt: iso(u.deleted_at),
          createdAt: iso(u.created_at),
        },
        consents: rows(consents),
        memberships: rows(memberships),
        bookings: rows(bookings.map(({ id: _id, ...b }) => b)),
        payments: rows(payments),
        complaints: rows(complaints),
      };
    });
  }
}
