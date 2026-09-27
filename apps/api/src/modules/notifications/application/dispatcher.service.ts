import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Locale } from '@jordan-sports/i18n';
import { sql } from 'kysely';
import type { Db, Tx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { bypassTenant } from '../../../platform/database/tenant.js';
import {
  renderBookingMessage,
  type BookingMessageFacts,
  type TemplateName,
} from '../domain/templates.js';
import { NOTIFICATION_CHANNEL, type NotificationChannel } from './channels.js';
import type { OutboxEvent } from './outbox.js';

const BATCH = 20;
const MAX_ATTEMPTS = 10;

interface Message {
  recipient: string;
  locale: Locale;
  template: TemplateName;
}

function asLocale(value: string | null | undefined): Locale {
  return value === 'en' ? 'en' : 'ar';
}

/**
 * Transactional outbox dispatcher (ADR-0007): claims pending events with SKIP LOCKED, sends each
 * message once per (event, recipient, template) and retries failures with exponential backoff.
 * Delivery is at-least-once towards the channel; the deliveries table prevents double records.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger('OutboxDispatcher');

  constructor(
    @Inject(DATABASE) private readonly db: Db,
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
  ) {}

  /** Processes one batch; returns how many events were handled. */
  async dispatchOnce(now = new Date()): Promise<number> {
    return this.db.transaction().execute(async (tx) => {
      const events = await tx
        .selectFrom('platform.outbox_events')
        .selectAll()
        .where('processed_at', 'is', null)
        .where('next_attempt_at', '<=', now)
        .orderBy('next_attempt_at')
        .limit(BATCH)
        .forUpdate()
        .skipLocked()
        .execute();
      for (const event of events) {
        await sql`SAVEPOINT event`.execute(tx);
        try {
          await this.handle(tx, event.id, {
            type: event.type,
            payload: event.payload,
          } as OutboxEvent);
          await tx
            .updateTable('platform.outbox_events')
            .set({ processed_at: now, attempts: event.attempts + 1, last_error: null })
            .where('id', '=', event.id)
            .execute();
          await sql`RELEASE SAVEPOINT event`.execute(tx);
        } catch (error) {
          await sql`ROLLBACK TO SAVEPOINT event`.execute(tx);
          const attempts = event.attempts + 1;
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Event ${event.id} (${event.type}) failed (attempt ${attempts}): ${message}`,
          );
          await tx
            .updateTable('platform.outbox_events')
            .set({
              attempts,
              last_error: message.slice(0, 500),
              next_attempt_at: new Date(now.getTime() + Math.min(2 ** attempts * 5_000, 3_600_000)),
              // Dead-lettered after too many attempts: kept for inspection, no longer retried.
              ...(attempts >= MAX_ATTEMPTS ? { processed_at: now } : {}),
            })
            .where('id', '=', event.id)
            .execute();
        }
      }
      return events.length;
    });
  }

  private async handle(tx: Tx, eventId: string, event: OutboxEvent): Promise<void> {
    switch (event.type) {
      case 'booking.confirmed':
      case 'booking.cancelled':
        return this.bookingEvent(tx, eventId, event);
      default:
        throw new Error(`Unknown event type ${(event as { type: string }).type}`);
    }
  }

  private async bookingEvent(tx: Tx, eventId: string, event: OutboxEvent): Promise<void> {
    // The worker reads across organizations (venue customer names) — explicit bypass.
    await bypassTenant(tx);
    const b = await tx
      .selectFrom('booking.bookings as b')
      .innerJoin('venue.venues as v', 'v.id', 'b.venue_id')
      .innerJoin('resource.resources as r', 'r.id', 'b.resource_id')
      .leftJoin('identity.users as u', 'u.id', 'b.customer_user_id')
      .select([
        'b.reference',
        'b.time_zone',
        'b.total',
        'b.currency',
        'b.cancel_reason',
        sql<Date>`lower(b.during)`.as('start'),
        'v.name as venue_name',
        'v.contact_phone as venue_phone',
        'r.name as resource_name',
        'u.phone as user_phone',
        'u.display_name as user_name',
        'u.locale as user_locale',
      ])
      .where('b.id', '=', event.payload.bookingId)
      .executeTakeFirstOrThrow();

    const facts: BookingMessageFacts = {
      reference: b.reference,
      venueName: b.venue_name as BookingMessageFacts['venueName'],
      resourceName: b.resource_name as BookingMessageFacts['resourceName'],
      start: new Date(b.start),
      timeZone: b.time_zone,
      price: b.total === null ? null : { amount: Number(b.total), currency: b.currency },
      customerName: b.user_name,
      customerPhone: b.user_phone,
      reason: b.cancel_reason,
    };
    const player = b.user_phone
      ? { recipient: b.user_phone, locale: asLocale(b.user_locale) }
      : null;
    // Venues receive Arabic messages by default (pilot decision: Arabic first).
    const venue = b.venue_phone ? { recipient: b.venue_phone, locale: 'ar' as Locale } : null;

    const messages: Message[] = [];
    if (event.type === 'booking.confirmed') {
      if (player) messages.push({ ...player, template: 'bookingConfirmed' });
      if (venue) messages.push({ ...venue, template: 'venueNewBooking' });
    } else if (event.payload.by === 'venue' || event.payload.by === 'admin') {
      if (player) messages.push({ ...player, template: 'bookingCancelledByVenue' });
    } else if (event.payload.by === 'customer') {
      if (player) messages.push({ ...player, template: 'bookingCancelled' });
      if (venue) messages.push({ ...venue, template: 'venueBookingCancelled' });
    }

    for (const m of messages) {
      const already = await tx
        .selectFrom('notification.deliveries')
        .select('id')
        .where('event_id', '=', eventId)
        .where('recipient', '=', m.recipient)
        .where('template', '=', m.template)
        .where('status', '=', 'sent')
        .executeTakeFirst();
      if (already) continue;
      const body = renderBookingMessage(m.template, m.locale, facts);
      await this.channel.send(m.recipient, body);
      await tx
        .insertInto('notification.deliveries')
        .values({
          id: uuidv7(),
          event_id: eventId,
          channel: this.channel.name,
          recipient: m.recipient,
          template: m.template,
          locale: m.locale,
          body,
          status: 'sent',
        })
        .onConflict((oc) => oc.columns(['event_id', 'recipient', 'template']).doNothing())
        .execute();
    }
  }
}
