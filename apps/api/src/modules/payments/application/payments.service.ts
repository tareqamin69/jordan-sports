import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Transaction } from '@jordan-sports/contracts';
import type { Db, Tx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { bypassTenant } from '../../../platform/database/tenant.js';
import { transaction } from '../../../platform/database/transaction.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';
import { PAYMENT_GATEWAY, type CheckoutStatus, type PaymentGateway } from '../domain/gateway.js';
import type { RefundReason } from '../domain/payment-rules.js';

/** Refund attempts that hit a gateway error before the refund is left for an admin to retry. */
const MAX_REFUND_ATTEMPTS = 5;

export interface ChargeRow {
  id: string;
  booking_id: string;
  status: string;
  gateway_ref: string | null;
  amount: string;
  currency: string;
  created_at: Date;
}

/**
 * Card money movements (ADR-0020): charge records, gateway calls and refunds. Booking state
 * changes stay in the bookings module, which calls these inside its own transactions. Gateway
 * calls never happen inside a database transaction.
 */
@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Db,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly audit: AuditService,
  ) {}

  get gatewayName(): string {
    return this.gateway.name;
  }

  // -------------------------------------------------------------------------------------------
  // Charges
  // -------------------------------------------------------------------------------------------

  /** The booking's live (pending or succeeded) charge, locked. */
  async liveCharge(tx: Tx, bookingId: string): Promise<ChargeRow | undefined> {
    return tx
      .selectFrom('payment.transactions')
      .select(['id', 'booking_id', 'status', 'gateway_ref', 'amount', 'currency', 'created_at'])
      .where('booking_id', '=', bookingId)
      .where('kind', '=', 'charge')
      .where('status', 'in', ['pending', 'succeeded'])
      .forUpdate()
      .executeTakeFirst();
  }

  async insertCharge(
    tx: Tx,
    input: {
      bookingId: string;
      organizationId: string;
      venueId: string;
      amount: number;
      currency: string;
    },
  ): Promise<string> {
    const id = uuidv7();
    await tx
      .insertInto('payment.transactions')
      .values({
        id,
        booking_id: input.bookingId,
        organization_id: input.organizationId,
        venue_id: input.venueId,
        kind: 'charge',
        gateway: this.gateway.name,
        amount: String(input.amount),
        currency: input.currency,
        status: 'pending',
      })
      .execute();
    return id;
  }

  /** Opens the gateway's payment page for a pending charge (outside any transaction). */
  async openCheckout(
    chargeId: string,
    input: {
      amount: number;
      currency: string;
      description: string;
      returnUrl: string;
      locale: 'ar' | 'en';
    },
  ): Promise<string> {
    let session;
    try {
      session = await this.gateway.createCheckout({ transactionId: chargeId, ...input });
    } catch (error) {
      this.log.error({ err: error, chargeId }, 'gateway checkout failed');
      await this.failCharge(this.db, chargeId, 'gateway_unavailable');
      throw new AppError('PAYMENT_GATEWAY_UNAVAILABLE', 502);
    }
    await this.db
      .updateTable('payment.transactions')
      .set({ gateway_ref: session.sessionId })
      .where('id', '=', chargeId)
      .execute();
    return session.redirectUrl;
  }

  /** What the gateway says about a charge's checkout (outside any transaction). */
  async checkoutStatus(charge: Pick<ChargeRow, 'gateway_ref'>): Promise<CheckoutStatus> {
    if (!charge.gateway_ref) return { status: 'pending' };
    try {
      return await this.gateway.getCheckout(charge.gateway_ref);
    } catch (error) {
      this.log.warn({ err: error }, 'gateway status check failed');
      return { status: 'pending' };
    }
  }

  async failCharge(db: Db | Tx, chargeId: string, failureCode: string): Promise<void> {
    await db
      .updateTable('payment.transactions')
      .set({ status: 'failed', failure_code: failureCode, completed_at: new Date() })
      .where('id', '=', chargeId)
      .where('status', '=', 'pending')
      .execute();
  }

  async succeedCharge(
    tx: Tx,
    chargeId: string,
    card: { brand: 'visa' | 'mastercard'; last4: string },
    now: Date,
  ): Promise<void> {
    await tx
      .updateTable('payment.transactions')
      .set({
        status: 'succeeded',
        card_brand: card.brand,
        card_last4: card.last4,
        completed_at: now,
      })
      .where('id', '=', chargeId)
      .execute();
  }

  /** Pending charges older than `olderThan` (the worker asks the gateway about them again). */
  async stalePendingCharges(olderThan: Date, limit = 100): Promise<ChargeRow[]> {
    return this.db
      .selectFrom('payment.transactions')
      .select(['id', 'booking_id', 'status', 'gateway_ref', 'amount', 'currency', 'created_at'])
      .where('kind', '=', 'charge')
      .where('status', '=', 'pending')
      .where('created_at', '<=', olderThan)
      .orderBy('created_at')
      .limit(limit)
      .execute();
  }

  // -------------------------------------------------------------------------------------------
  // Refunds
  // -------------------------------------------------------------------------------------------

  /**
   * Records a refund of a paid booking inside the caller's transaction (the gateway is called
   * after commit by `processRefunds`). Returns the amount, 0 when nothing is refunded.
   */
  async requestRefund(
    tx: Tx,
    input: { bookingId: string; reason: RefundReason; amount: number },
  ): Promise<number> {
    const charge = await tx
      .selectFrom('payment.transactions')
      .select(['amount', 'currency', 'organization_id', 'venue_id'])
      .where('booking_id', '=', input.bookingId)
      .where('kind', '=', 'charge')
      .where('status', '=', 'succeeded')
      .executeTakeFirst();
    if (!charge || input.amount <= 0) return 0;
    const paid = Number(charge.amount);
    const amount = Math.min(input.amount, paid);
    const inserted = await tx
      .insertInto('payment.transactions')
      .values({
        id: uuidv7(),
        booking_id: input.bookingId,
        organization_id: charge.organization_id,
        venue_id: charge.venue_id,
        kind: 'refund',
        gateway: this.gateway.name,
        amount: String(amount),
        currency: charge.currency,
        status: 'pending',
        reason: input.reason,
      })
      .onConflict((oc) => oc.column('booking_id').where('kind', '=', 'refund').doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!inserted) return 0;
    await tx
      .updateTable('booking.bookings')
      .set({ payment_status: amount >= paid ? 'REFUNDED' : 'PARTIALLY_REFUNDED' })
      .where('id', '=', input.bookingId)
      .execute();
    return amount;
  }

  /**
   * Sends pending refunds to the gateway (right after a cancellation, and by the worker for
   * retries). Gateway errors are retried a few times, then left failed for an admin.
   */
  async processRefunds(options: { bookingId?: string; limit?: number } = {}): Promise<number> {
    let q = this.db
      .selectFrom('payment.transactions as r')
      .innerJoin('payment.transactions as c', (join) =>
        join
          .onRef('c.booking_id', '=', 'r.booking_id')
          .on('c.kind', '=', 'charge')
          .on('c.status', '=', 'succeeded'),
      )
      .select(['r.id', 'r.amount', 'r.currency', 'r.attempts', 'c.gateway_ref as charge_ref'])
      .where('r.kind', '=', 'refund')
      .where('r.status', '=', 'pending')
      .where('r.gateway_ref', 'is', null)
      .orderBy('r.created_at')
      .limit(options.limit ?? 50);
    if (options.bookingId) q = q.where('r.booking_id', '=', options.bookingId);
    const due = await q.execute();
    let done = 0;
    for (const r of due) {
      const attempts = r.attempts + 1;
      try {
        const result = await this.gateway.refund({
          refundId: r.id,
          sessionId: r.charge_ref ?? '',
          amount: Number(r.amount),
          currency: r.currency,
        });
        await this.db
          .updateTable('payment.transactions')
          .set(
            result.status === 'failed'
              ? {
                  status: 'failed',
                  failure_code: result.failureCode,
                  attempts,
                  completed_at: new Date(),
                }
              : {
                  status: result.status,
                  gateway_ref: result.refundRef,
                  attempts,
                  ...(result.status === 'succeeded' ? { completed_at: new Date() } : {}),
                },
          )
          .where('id', '=', r.id)
          .execute();
        if (result.status === 'succeeded') done++;
      } catch (error) {
        this.log.warn({ err: error, refundId: r.id }, 'refund attempt failed');
        await this.db
          .updateTable('payment.transactions')
          .set(
            attempts >= MAX_REFUND_ATTEMPTS
              ? {
                  status: 'failed',
                  failure_code: 'gateway_unreachable',
                  attempts,
                  completed_at: new Date(),
                }
              : { attempts },
          )
          .where('id', '=', r.id)
          .execute();
      }
    }
    return done;
  }

  // -------------------------------------------------------------------------------------------
  // Admin
  // -------------------------------------------------------------------------------------------

  async list(query: {
    kind?: 'charge' | 'refund' | undefined;
    status?: 'pending' | 'succeeded' | 'failed' | undefined;
    q?: string | undefined;
    cursor?: string | undefined;
    limit: number;
  }): Promise<{ items: Transaction[]; nextCursor: string | null }> {
    return transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      let q = this.transactionQuery(tx);
      if (query.kind) q = q.where('t.kind', '=', query.kind);
      if (query.status) q = q.where('t.status', '=', query.status);
      if (query.q) q = q.where('b.reference', '=', query.q.toUpperCase());
      if (query.cursor) q = q.where('t.id', '<', query.cursor);
      const rows = await q
        .orderBy('t.id', 'desc')
        .limit(query.limit + 1)
        .execute();
      const items = rows.slice(0, query.limit).map(toTransaction);
      return {
        items,
        nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null,
      };
    });
  }

  /** Admin: send a failed refund again. */
  async retryRefund(
    actor: { userId: string; meta: RequestMeta },
    transactionId: string,
  ): Promise<Transaction> {
    await transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      const row = await tx
        .selectFrom('payment.transactions')
        .select(['kind', 'status', 'organization_id', 'booking_id'])
        .where('id', '=', transactionId)
        .forUpdate()
        .executeTakeFirst();
      if (!row) throw Errors.notFound();
      if (row.kind !== 'refund' || row.status !== 'failed') {
        throw new AppError('REFUND_NOT_RETRYABLE', 409);
      }
      await tx
        .updateTable('payment.transactions')
        .set({
          status: 'pending',
          failure_code: null,
          attempts: 0,
          gateway_ref: null,
          completed_at: null,
        })
        .where('id', '=', transactionId)
        .execute();
      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: actor.userId,
          action: 'payment.refund_retried',
          targetType: 'booking',
          targetId: row.booking_id,
          organizationId: row.organization_id,
          meta: actor.meta,
        },
        tx,
      );
    });
    const row = await this.db
      .selectFrom('payment.transactions')
      .select('booking_id')
      .where('id', '=', transactionId)
      .executeTakeFirstOrThrow();
    await this.processRefunds({ bookingId: row.booking_id });
    return transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      const r = await this.transactionQuery(tx)
        .where('t.id', '=', transactionId)
        .executeTakeFirstOrThrow();
      return toTransaction(r);
    });
  }

  private transactionQuery(tx: Tx) {
    return tx
      .selectFrom('payment.transactions as t')
      .innerJoin('booking.bookings as b', 'b.id', 't.booking_id')
      .innerJoin('venue.venues as v', 'v.id', 't.venue_id')
      .select([
        't.id',
        't.kind',
        't.status',
        't.amount',
        't.currency',
        't.gateway',
        't.gateway_ref',
        't.card_brand',
        't.card_last4',
        't.failure_code',
        't.reason',
        't.attempts',
        't.booking_id',
        't.created_at',
        't.completed_at',
        'b.reference',
        'v.name as venue_name',
      ]);
  }
}

type TransactionRow = {
  id: string;
  kind: string;
  status: string;
  amount: string;
  currency: string;
  gateway: string;
  gateway_ref: string | null;
  card_brand: string | null;
  card_last4: string | null;
  failure_code: string | null;
  reason: string | null;
  attempts: number;
  booking_id: string;
  created_at: Date;
  completed_at: Date | null;
  reference: string;
  venue_name: unknown;
};

function toTransaction(r: TransactionRow): Transaction {
  return {
    id: r.id,
    kind: r.kind as Transaction['kind'],
    status: r.status as Transaction['status'],
    amount: { amount: Number(r.amount), currency: r.currency },
    gateway: r.gateway,
    gatewayRef: r.gateway_ref,
    card: r.card_brand && r.card_last4 ? { brand: r.card_brand, last4: r.card_last4 } : null,
    failureCode: r.failure_code,
    reason: r.reason as Transaction['reason'],
    attempts: r.attempts,
    bookingId: r.booking_id,
    bookingReference: r.reference,
    venueName: r.venue_name as Transaction['venueName'],
    createdAt: r.created_at.toISOString(),
    completedAt: r.completed_at?.toISOString() ?? null,
  };
}
