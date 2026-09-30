import { Inject, Injectable } from '@nestjs/common';
import type {
  DuePayout,
  Earning,
  Payout,
  PayoutAccount,
  VenueEarnings,
} from '@jordan-sports/contracts';
import { sql } from 'kysely';
import { DateTime } from 'luxon';
import type { Db, Tx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { bypassTenant, setTenant } from '../../../platform/database/tenant.js';
import { transaction } from '../../../platform/database/transaction.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';
import { instantToLocal } from '../../scheduling/index.js';
import { VenueAccessService } from '../../venues/index.js';
import {
  earningOf,
  ibanChecksumValid,
  maskIban,
  nextPayoutDate,
  payoutCutoff,
} from '../domain/payout-rules.js';

/** Payouts are computed in Jordan time (the platform operates in one zone). */
const PLATFORM_ZONE = 'Asia/Amman';
const HISTORY_DAYS = 90;

type Localized = { ar?: string; en?: string };

interface EarningRow {
  id: string;
  reference: string;
  status: string;
  business_date: string;
  time_zone: string;
  currency: string;
  start: Date;
  end: Date;
  cancelled_at: Date | null;
  commission_bps: number | null;
  venue_commission_bps: number;
  resource_name: unknown;
  venue_id: string;
  organization_id: string;
  paid: string;
  refunded: string;
  payout_id: string | null;
  item_gross: string | null;
  item_commission: string | null;
  item_net: string | null;
}

type Actor = { userId: string; meta: RequestMeta };

/**
 * Venue earnings and weekly payouts (ADR-0020). Jorena collects card payments, keeps its
 * commission and transfers the rest to the organization's bank account; each transfer records
 * exactly which bookings it paid for, so nothing is paid twice.
 */
@Injectable()
export class PayoutsService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly access: VenueAccessService,
    private readonly audit: AuditService,
  ) {}

  /** Paid card bookings of one or all venues, with any refund and payout. */
  private earningRows(tx: Tx, filter: { venueId?: string; onlyUnpaid?: boolean }, since: string) {
    let q = tx
      .selectFrom('booking.bookings as b')
      .innerJoin('payment.transactions as c', (join) =>
        join
          .onRef('c.booking_id', '=', 'b.id')
          .on('c.kind', '=', 'charge')
          .on('c.status', '=', 'succeeded'),
      )
      .innerJoin('venue.venues as v', 'v.id', 'b.venue_id')
      .innerJoin('resource.resources as r', 'r.id', 'b.resource_id')
      .leftJoin('payment.transactions as rf', (join) =>
        join.onRef('rf.booking_id', '=', 'b.id').on('rf.kind', '=', 'refund'),
      )
      .leftJoin('finance.payout_items as pi', 'pi.booking_id', 'b.id')
      .select([
        'b.id',
        'b.reference',
        'b.status',
        'b.business_date',
        'b.time_zone',
        'b.currency',
        sql<Date>`lower(b.during)`.as('start'),
        sql<Date>`upper(b.during)`.as('end'),
        'b.cancelled_at',
        'b.commission_bps',
        sql<number>`coalesce(v.commission_bps, (SELECT s.commission_bps FROM platform.settings s))`.as(
          'venue_commission_bps',
        ),
        'r.name as resource_name',
        'b.venue_id',
        'b.organization_id',
        'c.amount as paid',
        sql<string>`coalesce(rf.amount, 0)`.as('refunded'),
        'pi.payout_id',
        'pi.gross as item_gross',
        'pi.commission as item_commission',
        'pi.net as item_net',
      ])
      .where('b.status', 'in', ['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']);
    if (filter.venueId) q = q.where('b.venue_id', '=', filter.venueId);
    q = filter.onlyUnpaid
      ? q.where('pi.payout_id', 'is', null)
      : q.where((eb) =>
          eb.or([eb('pi.payout_id', 'is', null), eb('b.business_date', '>=', since)]),
        );
    return q.orderBy(sql`lower(b.during)`, 'desc');
  }

  private toEarning(r: EarningRow, now: Date, cutoff: Date): Earning {
    const money = (amount: number) => ({ amount, currency: r.currency });
    const computed = earningOf({
      paid: Number(r.paid),
      refunded: Number(r.refunded),
      commissionBps: r.commission_bps ?? r.venue_commission_bps,
      status: r.status,
      end: new Date(r.end),
      cancelledAt: r.cancelled_at ? new Date(r.cancelled_at) : null,
      paidOut: r.payout_id !== null,
      now,
      cutoff,
    });
    // Paid-out bookings show exactly what the transfer included.
    const gross = r.item_gross !== null ? Number(r.item_gross) : computed.gross;
    const commission = r.item_commission !== null ? Number(r.item_commission) : computed.commission;
    const net = r.item_net !== null ? Number(r.item_net) : computed.net;
    return {
      bookingId: r.id,
      reference: r.reference,
      bookingStatus: r.status as Earning['bookingStatus'],
      businessDate: r.business_date,
      localStart: instantToLocal(new Date(r.start), r.time_zone).time,
      resourceName: r.resource_name as Localized,
      gross: money(gross),
      refunded: money(Number(r.refunded)),
      commission: money(commission),
      net: money(net),
      status: computed.status,
      payoutId: r.payout_id,
    };
  }

  // -------------------------------------------------------------------------------------------
  // Venue
  // -------------------------------------------------------------------------------------------

  async venueEarnings(userId: string, venueId: string, now = new Date()): Promise<VenueEarnings> {
    const { venue, role } = await this.access.require(userId, venueId, 'reports.read');
    return transaction(this.db, async (tx) => {
      await setTenant(tx, venue.organizationId);
      const cutoff = payoutCutoff(now, venue.timezone);
      const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
      const rows = (await this.earningRows(tx, { venueId }, since).execute()) as EarningRow[];
      const items = rows
        .map((r) => this.toEarning(r, now, cutoff))
        .filter((e) => e.gross.amount > 0 || e.status === 'paid');
      const sum = (status: Earning['status']) =>
        items.filter((e) => e.status === status).reduce((n, e) => n + e.net.amount, 0);
      const payouts = await this.payoutList(tx, { venueId, since });
      const account = await tx
        .selectFrom('finance.payout_accounts')
        .select(['iban', 'holder_name'])
        .where('organization_id', '=', venue.organizationId)
        .executeTakeFirst();
      const currency = venue.currency;
      return {
        commissionBps: venue.commissionBps,
        nextPayoutDate: nextPayoutDate(now, venue.timezone),
        totals: {
          due: { amount: sum('due'), currency },
          pending: { amount: sum('pending'), currency },
          upcoming: { amount: sum('upcoming'), currency },
          paid: { amount: payouts.reduce((n, p) => n + p.net.amount, 0), currency },
        },
        items,
        payouts,
        account: account
          ? {
              // Only the owner sees who the account belongs to.
              ibanMasked: maskIban(account.iban),
              holderName: role === 'owner' ? account.holder_name : '',
            }
          : null,
      };
    });
  }

  private async payoutList(
    tx: Tx,
    filter: { venueId?: string; since?: string; limit?: number },
  ): Promise<Array<Payout & { venueName: Localized; paidBy: string | null }>> {
    let q = tx
      .selectFrom('finance.payouts as p')
      .innerJoin('venue.venues as v', 'v.id', 'p.venue_id')
      .leftJoin('identity.users as u', 'u.id', 'p.paid_by')
      .select([
        'p.id',
        'p.venue_id',
        'p.currency',
        'p.gross',
        'p.commission',
        'p.net',
        'p.reference',
        'p.iban',
        'p.paid_at',
        'v.name as venue_name',
        'u.display_name as paid_by',
        (eb) =>
          eb
            .selectFrom('finance.payout_items as i')
            .select(eb.fn.countAll<string>().as('n'))
            .whereRef('i.payout_id', '=', 'p.id')
            .as('bookings'),
      ])
      .orderBy('p.paid_at', 'desc')
      .limit(filter.limit ?? 100);
    if (filter.venueId) q = q.where('p.venue_id', '=', filter.venueId);
    if (filter.since) q = q.where('p.paid_at', '>=', new Date(filter.since));
    const rows = await q.execute();
    return rows.map((p) => ({
      id: p.id,
      venueId: p.venue_id,
      gross: { amount: Number(p.gross), currency: p.currency },
      commission: { amount: Number(p.commission), currency: p.currency },
      net: { amount: Number(p.net), currency: p.currency },
      bookings: Number(p.bookings ?? 0),
      reference: p.reference,
      ibanLast4: p.iban.slice(-4),
      paidAt: p.paid_at.toISOString(),
      venueName: p.venue_name as Localized,
      paidBy: p.paid_by,
    }));
  }

  async getAccount(userId: string, venueId: string): Promise<PayoutAccount | null> {
    const { venue } = await this.access.require(userId, venueId, 'payouts.manage');
    return transaction(this.db, async (tx) => {
      await setTenant(tx, venue.organizationId);
      return this.readAccount(tx, venue.organizationId);
    });
  }

  private async readAccount(tx: Tx, organizationId: string): Promise<PayoutAccount | null> {
    const a = await tx
      .selectFrom('finance.payout_accounts')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    return a
      ? {
          iban: a.iban,
          holderName: a.holder_name,
          bankName: a.bank_name,
          updatedAt: a.updated_at.toISOString(),
        }
      : null;
  }

  async setAccount(
    actor: Actor,
    venueId: string,
    input: { iban: string; holderName: string; bankName?: string | null | undefined },
  ): Promise<PayoutAccount | null> {
    const { venue } = await this.access.require(actor.userId, venueId, 'payouts.manage');
    if (!ibanChecksumValid(input.iban)) throw new AppError('INVALID_IBAN', 400);
    return transaction(this.db, async (tx) => {
      await setTenant(tx, venue.organizationId);
      const before = await this.readAccount(tx, venue.organizationId);
      const values = {
        iban: input.iban,
        holder_name: input.holderName,
        bank_name: input.bankName ?? null,
        updated_by: actor.userId,
        updated_at: new Date(),
      };
      await tx
        .insertInto('finance.payout_accounts')
        .values({ organization_id: venue.organizationId, ...values })
        .onConflict((oc) => oc.column('organization_id').doUpdateSet(values))
        .execute();
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: 'finance.payout_account_set',
          targetType: 'organization',
          targetId: venue.organizationId,
          organizationId: venue.organizationId,
          // Only the last four characters go to the audit log.
          details: {
            before: before ? { ibanLast4: before.iban.slice(-4) } : null,
            after: { ibanLast4: input.iban.slice(-4) },
          },
          meta: actor.meta,
        },
        tx,
      );
      return this.readAccount(tx, venue.organizationId);
    });
  }

  // -------------------------------------------------------------------------------------------
  // Admin
  // -------------------------------------------------------------------------------------------

  async adminOverview(now = new Date()): Promise<{
    cutoffDate: string;
    due: DuePayout[];
    paid: Array<Payout & { venueName: Localized; paidBy: string | null }>;
  }> {
    return transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      const cutoff = payoutCutoff(now, PLATFORM_ZONE);
      const rows = (await this.earningRows(tx, { onlyUnpaid: true }, '').execute()) as EarningRow[];
      const byVenue = new Map<
        string,
        { net: number; gross: number; commission: number; n: number; currency: string; org: string }
      >();
      for (const r of rows) {
        const e = this.toEarning(r, now, cutoff);
        if (e.status !== 'due' || e.gross.amount <= 0) continue;
        const v = byVenue.get(r.venue_id) ?? {
          net: 0,
          gross: 0,
          commission: 0,
          n: 0,
          currency: r.currency,
          org: r.organization_id,
        };
        v.net += e.net.amount;
        v.gross += e.gross.amount;
        v.commission += e.commission.amount;
        v.n += 1;
        byVenue.set(r.venue_id, v);
      }
      const ids = [...byVenue.keys()];
      const venues = ids.length
        ? await tx
            .selectFrom('venue.venues as v')
            .innerJoin('tenancy.organizations as o', 'o.id', 'v.organization_id')
            .leftJoin('finance.payout_accounts as a', 'a.organization_id', 'v.organization_id')
            .select([
              'v.id',
              'v.name',
              'o.name as org_name',
              'a.iban',
              'a.holder_name',
              'a.bank_name',
            ])
            .where('v.id', 'in', ids)
            .execute()
        : [];
      const due: DuePayout[] = venues
        .map((v) => {
          const t = byVenue.get(v.id)!;
          const money = (amount: number) => ({ amount, currency: t.currency });
          return {
            venueId: v.id,
            venueName: v.name as Localized,
            organizationName: v.org_name as Localized,
            gross: money(t.gross),
            commission: money(t.commission),
            net: money(t.net),
            bookings: t.n,
            account:
              v.iban && v.holder_name
                ? { iban: v.iban, holderName: v.holder_name, bankName: v.bank_name }
                : null,
          };
        })
        .sort((a, b) => b.net.amount - a.net.amount);
      const paid = await this.payoutList(tx, { limit: 50 });
      return {
        cutoffDate: DateTime.fromJSDate(cutoff, { zone: PLATFORM_ZONE })
          .minus({ days: 1 })
          .toISODate()!,
        due,
        paid,
      };
    });
  }

  /** Records the bank transfer of everything due to a venue now (one payout, its bookings listed). */
  async markPaid(
    actor: Actor,
    venueId: string,
    input: { reference: string; expectedNet: number },
    now = new Date(),
  ): Promise<Payout & { venueName: Localized; paidBy: string | null }> {
    return transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      // Serializes payouts of the same venue.
      const venue = await tx
        .selectFrom('venue.venues')
        .select(['id', 'organization_id', 'currency'])
        .where('id', '=', venueId)
        .forUpdate()
        .executeTakeFirst();
      if (!venue) throw Errors.notFound();
      const account = await tx
        .selectFrom('finance.payout_accounts')
        .select('iban')
        .where('organization_id', '=', venue.organization_id)
        .executeTakeFirst();
      if (!account) throw new AppError('PAYOUT_ACCOUNT_MISSING', 409);
      const cutoff = payoutCutoff(now, PLATFORM_ZONE);
      const rows = (await this.earningRows(
        tx,
        { venueId, onlyUnpaid: true },
        '',
      ).execute()) as EarningRow[];
      const items = rows
        .map((r) => this.toEarning(r, now, cutoff))
        .filter((e) => e.status === 'due' && e.gross.amount > 0);
      if (items.length === 0) throw new AppError('NOTHING_TO_PAY_OUT', 409);
      const total = (k: 'gross' | 'commission' | 'net') =>
        items.reduce((n, e) => n + e[k].amount, 0);
      if (total('net') !== input.expectedNet) throw new AppError('PAYOUT_AMOUNT_CHANGED', 409);
      const id = uuidv7();
      await tx
        .insertInto('finance.payouts')
        .values({
          id,
          organization_id: venue.organization_id,
          venue_id: venueId,
          currency: venue.currency,
          gross: String(total('gross')),
          commission: String(total('commission')),
          net: String(total('net')),
          reference: input.reference,
          iban: account.iban,
          paid_by: actor.userId,
          paid_at: now,
        })
        .execute();
      await tx
        .insertInto('finance.payout_items')
        .values(
          items.map((e) => ({
            payout_id: id,
            booking_id: e.bookingId,
            gross: String(e.gross.amount),
            commission: String(e.commission.amount),
            net: String(e.net.amount),
          })),
        )
        .execute();
      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: actor.userId,
          action: 'finance.payout_recorded',
          targetType: 'venue',
          targetId: venueId,
          organizationId: venue.organization_id,
          details: {
            after: { net: total('net'), bookings: items.length, reference: input.reference },
          },
          meta: actor.meta,
        },
        tx,
      );
      const [payout] = await this.payoutList(tx, { venueId, limit: 1 });
      return payout!;
    });
  }
}
