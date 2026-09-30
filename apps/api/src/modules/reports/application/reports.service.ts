import { Inject, Injectable } from '@nestjs/common';
import type { Overview, ReportPeriod } from '@jordan-sports/contracts';
import { sql } from 'kysely';
import { commissionAmount } from '../../payments/index.js';
import { DateTime } from 'luxon';
import type { Db } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { bypassTenant } from '../../../platform/database/tenant.js';
import { transaction } from '../../../platform/database/transaction.js';
import { toCsv } from '../../../platform/http/csv.js';

const ZONE = 'Asia/Amman';
type Localized = { ar?: string; en?: string };

/** Local (Amman) calendar date of a timestamp column, for grouping and filtering. */
const localDate = (column: string) => sql<string>`(${sql.ref(column)} AT TIME ZONE ${ZONE})::date`;

/** Dashboard figures and exports (docs/rbac-plan.md §7.1, §7.9). Reads across organizations. */
@Injectable()
export class ReportsService {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  async overview(period: ReportPeriod, withRevenue: boolean, now = new Date()): Promise<Overview> {
    const today = DateTime.fromJSDate(now, { zone: ZONE }).startOf('day');
    const days = period === 'today' ? 1 : period === 'week' ? 7 : 30;
    const from = today.minus({ days: days - 1 }).toISODate()!;
    const to = today.toISODate()!;
    const seriesFrom = today.minus({ days: Math.max(days, 14) - 1 }).toISODate()!;

    return transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      const inPeriod = (column: string) =>
        sql<boolean>`${localDate(column)} BETWEEN ${from}::date AND ${to}::date`;

      const bookings = await tx
        .selectFrom('booking.bookings')
        .select([
          sql<string>`count(*) FILTER (WHERE ${inPeriod('created_at')} AND status <> 'EXPIRED')`.as(
            'made',
          ),
          sql<string>`count(*) FILTER (WHERE ${inPeriod('created_at')} AND status <> 'EXPIRED' AND channel = 'MARKETPLACE')`.as(
            'online',
          ),
          sql<string>`count(*) FILTER (WHERE status = 'CANCELLED' AND cancelled_at IS NOT NULL AND ${inPeriod('cancelled_at')})`.as(
            'cancelled',
          ),
          sql<string>`count(*) FILTER (WHERE status = 'NO_SHOW' AND business_date BETWEEN ${from}::date AND ${to}::date)`.as(
            'no_shows',
          ),
          sql<string>`coalesce(sum(total) FILTER (WHERE ${inPeriod('created_at')} AND status IN ('CONFIRMED', 'COMPLETED')), 0)`.as(
            'value',
          ),
        ])
        .executeTakeFirstOrThrow();
      const users = await tx
        .selectFrom('identity.users')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('platform_role', 'is', null)
        .where(inPeriod('created_at'))
        .executeTakeFirstOrThrow();
      const venues = await tx
        .selectFrom('venue.venues')
        .select([
          sql<string>`count(*) FILTER (WHERE ${inPeriod('created_at')})`.as('new'),
          sql<string>`count(*) FILTER (WHERE status = 'submitted')`.as('pending'),
        ])
        .where('archived_at', 'is', null)
        .executeTakeFirstOrThrow();
      const complaints = await tx
        .selectFrom('support.complaints')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('status', '!=', 'resolved')
        .executeTakeFirstOrThrow();
      // Commission on card payments taken in the period, net of refunds (ADR-0020).
      const commission = withRevenue
        ? await tx
            .selectFrom('payment.transactions as c')
            .innerJoin('booking.bookings as b', 'b.id', 'c.booking_id')
            .leftJoin('payment.transactions as rf', (join) =>
              join.onRef('rf.booking_id', '=', 'c.booking_id').on('rf.kind', '=', 'refund'),
            )
            .select(
              sql<string>`coalesce(sum(round((c.amount - coalesce(rf.amount, 0)) * coalesce(b.commission_bps, 0) / 10000.0)), 0)`.as(
                'n',
              ),
            )
            .where('c.kind', '=', 'charge')
            .where('c.status', '=', 'succeeded')
            .where(inPeriod('c.completed_at'))
            .executeTakeFirstOrThrow()
        : null;

      const daily = await tx
        .selectFrom('booking.bookings')
        .select([
          localDate('created_at').as('day'),
          sql<string>`count(*)`.as('n'),
          sql<string>`coalesce(sum(total) FILTER (WHERE status IN ('CONFIRMED', 'COMPLETED')), 0)`.as(
            'value',
          ),
        ])
        .where('status', '<>', 'EXPIRED')
        .where(sql<boolean>`${localDate('created_at')} BETWEEN ${seriesFrom}::date AND ${to}::date`)
        .groupBy(sql`1`)
        .execute();
      const byDay = new Map(daily.map((d) => [String(d.day).slice(0, 10), d]));
      const series: Overview['daily'] = [];
      for (
        let d = DateTime.fromISO(seriesFrom, { zone: ZONE });
        d <= today;
        d = d.plus({ days: 1 })
      ) {
        const key = d.toISODate()!;
        const row = byDay.get(key);
        series.push({
          date: key,
          bookings: row ? Number(row.n) : 0,
          bookingValue: withRevenue ? (row ? Number(row.value) : 0) : null,
        });
      }

      const topVenues = await tx
        .selectFrom('booking.bookings as b')
        .innerJoin('venue.venues as v', 'v.id', 'b.venue_id')
        .select(['v.id', 'v.name', sql<string>`count(*)`.as('n')])
        .where('b.status', '<>', 'EXPIRED')
        .where(inPeriod('b.created_at'))
        .groupBy(['v.id', 'v.name'])
        .orderBy(sql`count(*)`, 'desc')
        .limit(5)
        .execute();
      const topAreas = await tx
        .selectFrom('booking.bookings as b')
        .innerJoin('venue.venues as v', 'v.id', 'b.venue_id')
        .innerJoin('catalog.cities as g', 'g.id', 'v.city_id')
        .leftJoin('catalog.areas as a', 'a.id', 'v.area_id')
        .select(['g.name as g_name', 'a.name as a_name', sql<string>`count(*)`.as('n')])
        .where('b.status', '<>', 'EXPIRED')
        .where(inPeriod('b.created_at'))
        .groupBy(['g.id', 'g.name', 'a.id', 'a.name'])
        .orderBy(sql`count(*)`, 'desc')
        .limit(5)
        .execute();

      return {
        period,
        from,
        to,
        totals: {
          bookings: Number(bookings.made),
          online: Number(bookings.online),
          cancellations: Number(bookings.cancelled),
          noShows: Number(bookings.no_shows),
          newUsers: Number(users.n),
          newVenues: Number(venues.new),
          openComplaints: Number(complaints.n),
          pendingVenues: Number(venues.pending),
        },
        revenue:
          withRevenue && commission
            ? {
                bookingValue: { amount: Number(bookings.value), currency: 'JOD' },
                commission: { amount: Number(commission.n), currency: 'JOD' },
              }
            : null,
        daily: period === 'today' ? series : series.slice(-days),
        topVenues: topVenues.map((v) => ({
          venueId: v.id,
          name: v.name as Localized,
          bookings: Number(v.n),
        })),
        topAreas: topAreas.map((a) => ({
          governorate: a.g_name as Localized,
          area: (a.a_name as Localized | null) ?? null,
          bookings: Number(a.n),
        })),
      };
    });
  }

  /** Finance export: one row per booking on the given business dates (amounts in fils). */
  async bookingsCsv(from: string, to: string): Promise<string> {
    return transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      const rows = await tx
        .selectFrom('booking.bookings as b')
        .innerJoin('venue.venues as v', 'v.id', 'b.venue_id')
        .innerJoin('tenancy.organizations as o', 'o.id', 'b.organization_id')
        .leftJoin('payment.transactions as c', (join) =>
          join
            .onRef('c.booking_id', '=', 'b.id')
            .on('c.kind', '=', 'charge')
            .on('c.status', '=', 'succeeded'),
        )
        .leftJoin('payment.transactions as rf', (join) =>
          join.onRef('rf.booking_id', '=', 'b.id').on('rf.kind', '=', 'refund'),
        )
        .select([
          'b.reference',
          'b.business_date',
          sql<Date>`lower(b.during)`.as('start'),
          'b.status',
          'b.channel',
          'b.payment_method',
          'b.total',
          'b.currency',
          'b.cancel_reason',
          'b.late_cancellation',
          'b.created_at',
          'v.name as venue_name',
          'o.name as org_name',
          'c.amount as paid',
          'rf.amount as refunded',
          'b.commission_bps',
        ])
        .where('b.business_date', '>=', from)
        .where('b.business_date', '<=', to)
        .where('b.status', '<>', 'EXPIRED')
        .orderBy('b.business_date')
        .orderBy(sql`lower(b.during)`)
        .limit(50_000)
        .execute();
      return toCsv(
        [
          'reference',
          'business_date',
          'start',
          'status',
          'channel',
          'payment_method',
          'total_fils',
          'currency',
          'paid_fils',
          'refunded_fils',
          'commission_fils',
          'venue',
          'organization',
          'late_cancellation',
          'cancel_reason',
          'created_at',
        ],
        rows.map((r) => [
          r.reference,
          String(r.business_date).slice(0, 10),
          new Date(r.start).toISOString(),
          r.status,
          r.channel,
          r.payment_method,
          r.total === null ? null : Number(r.total),
          r.currency,
          r.paid === null ? null : Number(r.paid),
          r.refunded === null ? null : Number(r.refunded),
          r.paid === null
            ? null
            : commissionAmount(Number(r.paid) - Number(r.refunded ?? 0), r.commission_bps ?? 0),
          (r.venue_name as Localized).ar ?? (r.venue_name as Localized).en,
          (r.org_name as Localized).ar ?? (r.org_name as Localized).en,
          r.late_cancellation,
          r.cancel_reason,
          r.created_at.toISOString(),
        ]),
      );
    });
  }
}
