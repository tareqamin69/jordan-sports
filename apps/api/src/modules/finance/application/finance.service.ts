import { Inject, Injectable } from '@nestjs/common';
import type { Balance } from '@jordan-sports/contracts';
import { sql } from 'kysely';
import { APP_CONFIG } from '../../../platform/config/config.module.js';
import type { AppConfig } from '../../../platform/config/config.js';
import type { Db, Tx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { bypassTenant, setTenant } from '../../../platform/database/tenant.js';
import { transaction } from '../../../platform/database/transaction.js';
import { Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';
import { VenueAccessService } from '../../venues/index.js';
import {
  balanceLevel,
  LOW_BALANCE_THRESHOLD,
  REFUND_OVERDUE_HOURS,
} from '../domain/finance-rules.js';
import { postEntry } from './ledger.js';

const HISTORY_SHOWN = 50;

/** Balance reads for venues and admins, and admin adjustments (plan §5). */
@Injectable()
export class FinanceService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly access: VenueAccessService,
    private readonly audit: AuditService,
  ) {}

  /** The caller's transaction must have the tenant set (or bypassed). */
  async view(
    tx: Tx,
    organizationId: string,
    cliqEnabled: boolean | null = null,
    now = new Date(),
  ): Promise<Balance> {
    const row = await tx
      .selectFrom('finance.balances')
      .select(['balance', 'currency'])
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    const balance = row ? Number(row.balance) : 0;
    const currency = row?.currency ?? 'JOD';
    const entries = await tx
      .selectFrom('finance.balance_entries as e')
      .leftJoin('booking.bookings as b', 'b.id', 'e.booking_id')
      .select([
        'e.id',
        'e.kind',
        'e.amount',
        'e.currency',
        'e.balance_after',
        'e.reason',
        'e.created_at',
        'b.reference as booking_reference',
      ])
      .where('e.organization_id', '=', organizationId)
      .orderBy('e.created_at', 'desc')
      .orderBy('e.id', 'desc')
      .limit(HISTORY_SHOWN)
      .execute();
    const overdue = await tx
      .selectFrom('payment.payments')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('organization_id', '=', organizationId)
      .where('refund_status', '=', 'DUE')
      .where('refund_due_at', '<=', new Date(now.getTime() - REFUND_OVERDUE_HOURS * 3_600_000))
      .executeTakeFirstOrThrow();
    const taking = await sql<{ ok: boolean }>`
      SELECT finance.org_takes_online_bookings(${organizationId}::uuid, ${now.toISOString()}::timestamptz) AS ok
    `.execute(tx);
    return {
      organizationId,
      balance: { amount: balance, currency },
      lowBalanceThreshold: { amount: LOW_BALANCE_THRESHOLD, currency },
      level: balanceLevel(balance),
      takingOnlineBookings: taking.rows[0]?.ok ?? false,
      cliqEnabled,
      overdueRefunds: Number(overdue.n),
      entries: entries.map((e) => ({
        id: e.id,
        kind: e.kind as Balance['entries'][number]['kind'],
        amount: { amount: Number(e.amount), currency: e.currency },
        balanceAfter: { amount: Number(e.balance_after), currency: e.currency },
        bookingReference: e.booking_reference,
        reason: e.reason,
        createdAt: new Date(e.created_at).toISOString(),
      })),
    };
  }

  /** Owners and managers see their organization's balance. */
  async forVenue(userId: string, venueId: string): Promise<Balance> {
    const { venue } = await this.access.require(userId, venueId, 'venue.manage');
    return transaction(this.db, async (tx) => {
      await setTenant(tx, venue.organizationId);
      return this.view(
        tx,
        venue.organizationId,
        this.config.features.cliqPayments && venue.cliqAlias !== null,
      );
    });
  }

  async forAdmin(organizationId: string): Promise<Balance> {
    return transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      await this.requireOrganization(tx, organizationId);
      return this.view(tx, organizationId);
    });
  }

  /** Manual credit or debit by platform staff, always with a reason (audited). */
  async adjust(
    actor: { userId: string; meta: RequestMeta },
    organizationId: string,
    amount: number,
    reason: string,
  ): Promise<Balance> {
    return transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      await this.requireOrganization(tx, organizationId);
      const posted = await postEntry(tx, {
        organizationId,
        kind: 'adjustment',
        amount,
        currency: 'JOD',
        reason,
        createdBy: actor.userId,
      });
      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: actor.userId,
          action: 'finance.balance_adjusted',
          targetType: 'organization',
          targetId: organizationId,
          organizationId,
          reason,
          details: { amount, balanceAfter: posted?.after },
          meta: actor.meta,
        },
        tx,
      );
      return this.view(tx, organizationId);
    });
  }

  private async requireOrganization(tx: Tx, organizationId: string): Promise<void> {
    const org = await tx
      .selectFrom('tenancy.organizations')
      .select('id')
      .where('id', '=', organizationId)
      .executeTakeFirst();
    if (!org) throw Errors.notFound();
  }
}
