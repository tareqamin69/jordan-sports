import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  hasPlatformPermission,
  type AdminComplaint,
  type Complaint,
  type ComplaintCategory,
  type ComplaintMessage,
  type ComplaintStatus,
  type PlatformRole,
} from '@jordan-sports/contracts';
import type { Db, DbOrTx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';

type Localized = { ar?: string; en?: string };

interface Caller {
  readonly userId: string;
  readonly meta: RequestMeta;
}

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newReference = () =>
  `C-${Array.from({ length: 6 }, () => REF_ALPHABET[randomInt(0, REF_ALPHABET.length)]).join('')}`;

/**
 * Problem reports (docs/rbac-plan.md §7.4). Players report about their own bookings or any
 * venue; venue staff report for their venue. The platform team works the queue.
 */
@Injectable()
export class ComplaintsService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  private query(db: DbOrTx) {
    return db
      .selectFrom('support.complaints as c')
      .leftJoin('venue.venues as v', 'v.id', 'c.venue_id')
      .leftJoin('booking.bookings as b', 'b.id', 'c.booking_id')
      .innerJoin('identity.users as r', 'r.id', 'c.reporter_user_id')
      .leftJoin('identity.users as a', 'a.id', 'c.assignee_id')
      .select([
        'c.id',
        'c.reference',
        'c.reporter_kind',
        'c.category',
        'c.status',
        'c.body',
        'c.venue_id',
        'c.organization_id',
        'c.created_at',
        'c.updated_at',
        'c.resolved_at',
        'c.reporter_user_id',
        'c.assignee_id',
        'v.name as venue_name',
        'b.reference as booking_reference',
        'r.display_name as reporter_name',
        'r.phone as reporter_phone',
        'a.display_name as assignee_name',
      ]);
  }

  private async messages(db: DbOrTx, ids: string[], includeInternal: boolean) {
    if (ids.length === 0) return new Map<string, ComplaintMessage[]>();
    let q = db
      .selectFrom('support.complaint_messages as m')
      .innerJoin('identity.users as u', 'u.id', 'm.author_user_id')
      .select([
        'm.id',
        'm.complaint_id',
        'm.author_kind',
        'm.body',
        'm.internal',
        'm.created_at',
        'u.display_name',
      ])
      .where('m.complaint_id', 'in', ids)
      .orderBy('m.created_at')
      .orderBy('m.id');
    if (!includeInternal) q = q.where('m.internal', '=', false);
    const map = new Map<string, ComplaintMessage[]>();
    for (const m of await q.execute()) {
      const list = map.get(m.complaint_id) ?? [];
      list.push({
        id: m.id,
        authorKind: m.author_kind as ComplaintMessage['authorKind'],
        // Reporters see "platform support", not the staff member's name.
        authorName: includeInternal || m.author_kind === 'reporter' ? m.display_name : null,
        body: m.body,
        internal: m.internal,
        createdAt: m.created_at.toISOString(),
      });
      map.set(m.complaint_id, list);
    }
    return map;
  }

  private toComplaint(
    r: Awaited<ReturnType<ReturnType<ComplaintsService['query']>['executeTakeFirstOrThrow']>>,
    messages: ComplaintMessage[],
  ): Complaint {
    return {
      id: r.id,
      reference: r.reference,
      reporterKind: r.reporter_kind as Complaint['reporterKind'],
      category: r.category as ComplaintCategory,
      status: r.status as ComplaintStatus,
      body: r.body,
      venue: r.venue_id ? { id: r.venue_id, name: (r.venue_name ?? {}) as Localized } : null,
      bookingReference: r.booking_reference,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      resolvedAt: r.resolved_at?.toISOString() ?? null,
      messages,
    };
  }

  private toAdmin(
    r: Awaited<ReturnType<ReturnType<ComplaintsService['query']>['executeTakeFirstOrThrow']>>,
    messages: ComplaintMessage[],
  ): AdminComplaint {
    return {
      ...this.toComplaint(r, messages),
      reporter: { id: r.reporter_user_id, name: r.reporter_name, phone: r.reporter_phone },
      assignee: r.assignee_id ? { id: r.assignee_id, name: r.assignee_name } : null,
    };
  }

  private async insert(
    caller: Caller,
    values: {
      kind: 'player' | 'venue';
      category: ComplaintCategory;
      body: string;
      venueId: string | null;
      organizationId: string | null;
      bookingId: string | null;
    },
  ): Promise<string> {
    const id = uuidv7();
    await this.db.transaction().execute(async (tx) => {
      await tx
        .insertInto('support.complaints')
        .values({
          id,
          reference: newReference(),
          reporter_user_id: caller.userId,
          reporter_kind: values.kind,
          organization_id: values.organizationId,
          venue_id: values.venueId,
          booking_id: values.bookingId,
          category: values.category,
          body: values.body,
        })
        .execute();
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: caller.userId,
          action: 'complaint.reported',
          targetType: 'complaint',
          targetId: id,
          organizationId: values.organizationId,
          details: { kind: values.kind, category: values.category, venueId: values.venueId },
          meta: caller.meta,
        },
        tx,
      );
    });
    return id;
  }

  /** A player reports a problem; a booking must be their own, a venue must exist. */
  async reportAsPlayer(
    caller: Caller,
    input: {
      category: ComplaintCategory;
      body: string;
      bookingId?: string | undefined;
      venueId?: string | undefined;
    },
  ): Promise<Complaint> {
    let venueId = input.venueId ?? null;
    let organizationId: string | null = null;
    if (input.bookingId) {
      const booking = await this.db
        .selectFrom('booking.bookings')
        .select(['venue_id', 'organization_id'])
        .where('id', '=', input.bookingId)
        .where('customer_user_id', '=', caller.userId)
        .executeTakeFirst();
      if (!booking) throw Errors.notFound();
      venueId = booking.venue_id;
      organizationId = booking.organization_id;
    } else if (venueId) {
      const venue = await this.db
        .selectFrom('venue.venues')
        .select('organization_id')
        .where('id', '=', venueId)
        .where('archived_at', 'is', null)
        .executeTakeFirst();
      if (!venue) throw Errors.notFound();
      organizationId = venue.organization_id;
    }
    const id = await this.insert(caller, {
      kind: 'player',
      category: input.category,
      body: input.body,
      venueId,
      organizationId,
      bookingId: input.bookingId ?? null,
    });
    return this.mine(caller.userId, id);
  }

  /** Venue staff report for their venue (the guard checked `complaints.create`). */
  async reportAsVenue(
    caller: Caller,
    venue: { venueId: string; organizationId: string },
    input: { category: ComplaintCategory; body: string; bookingId?: string | undefined },
  ): Promise<Complaint> {
    if (input.bookingId) {
      const booking = await this.db
        .selectFrom('booking.bookings')
        .select('id')
        .where('id', '=', input.bookingId)
        .where('venue_id', '=', venue.venueId)
        .executeTakeFirst();
      if (!booking) throw Errors.notFound();
    }
    const id = await this.insert(caller, {
      kind: 'venue',
      category: input.category,
      body: input.body,
      venueId: venue.venueId,
      organizationId: venue.organizationId,
      bookingId: input.bookingId ?? null,
    });
    return this.mine(caller.userId, id);
  }

  async listMine(userId: string): Promise<Complaint[]> {
    const rows = await this.query(this.db)
      .where('c.reporter_user_id', '=', userId)
      .orderBy('c.created_at', 'desc')
      .limit(50)
      .execute();
    const messages = await this.messages(
      this.db,
      rows.map((r) => r.id),
      false,
    );
    return rows.map((r) => this.toComplaint(r, messages.get(r.id) ?? []));
  }

  private async mine(userId: string, id: string): Promise<Complaint> {
    const row = await this.query(this.db)
      .where('c.id', '=', id)
      .where('c.reporter_user_id', '=', userId)
      .executeTakeFirst();
    if (!row) throw Errors.notFound();
    const messages = await this.messages(this.db, [id], false);
    return this.toComplaint(row, messages.get(id) ?? []);
  }

  async replyAsReporter(caller: Caller, id: string, body: string): Promise<Complaint> {
    await this.mine(caller.userId, id);
    await this.db.transaction().execute(async (tx) => {
      await tx
        .insertInto('support.complaint_messages')
        .values({
          id: uuidv7(),
          complaint_id: id,
          author_user_id: caller.userId,
          author_kind: 'reporter',
          body,
        })
        .execute();
      // A new message from the reporter reopens a resolved complaint.
      await tx
        .updateTable('support.complaints')
        .set({ status: 'in_progress', resolved_at: null })
        .where('id', '=', id)
        .where('status', '=', 'resolved')
        .execute();
    });
    return this.mine(caller.userId, id);
  }

  // ------------------------------------------------------------------------------------------
  // Platform team
  // ------------------------------------------------------------------------------------------

  async adminList(
    callerId: string,
    filters: {
      status?: ComplaintStatus | undefined;
      assignee?: string | undefined;
      venueId?: string | undefined;
      q?: string | undefined;
      cursor?: string | undefined;
      limit: number;
    },
  ): Promise<{ items: AdminComplaint[]; nextCursor: string | null }> {
    let q = this.query(this.db)
      .orderBy('c.id', 'desc')
      .limit(filters.limit + 1);
    if (filters.cursor) q = q.where('c.id', '<', filters.cursor);
    if (filters.status) q = q.where('c.status', '=', filters.status);
    if (filters.venueId) q = q.where('c.venue_id', '=', filters.venueId);
    if (filters.assignee === 'me') q = q.where('c.assignee_id', '=', callerId);
    else if (filters.assignee === 'none') q = q.where('c.assignee_id', 'is', null);
    else if (filters.assignee) q = q.where('c.assignee_id', '=', filters.assignee);
    if (filters.q) {
      const like = `%${filters.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      q = q.where((eb) =>
        eb.or([
          eb('c.reference', 'ilike', like),
          eb('c.body', 'ilike', like),
          eb('r.phone', 'ilike', like),
          eb('r.display_name', 'ilike', like),
        ]),
      );
    }
    const rows = await q.execute();
    const items = rows.slice(0, filters.limit);
    return {
      items: items.map((r) => this.toAdmin(r, [])),
      nextCursor: rows.length > filters.limit ? items[items.length - 1]!.id : null,
    };
  }

  async adminGet(id: string, db: DbOrTx = this.db): Promise<AdminComplaint> {
    const row = await this.query(db).where('c.id', '=', id).executeTakeFirst();
    if (!row) throw Errors.notFound();
    const messages = await this.messages(db, [id], true);
    return this.toAdmin(row, messages.get(id) ?? []);
  }

  async adminUpdate(
    caller: Caller,
    id: string,
    patch: { status?: ComplaintStatus | undefined; assigneeId?: string | null | undefined },
  ): Promise<AdminComplaint> {
    return this.db.transaction().execute(async (tx) => {
      const before = await tx
        .selectFrom('support.complaints')
        .select(['status', 'assignee_id', 'organization_id'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!before) throw Errors.notFound();
      if (patch.assigneeId) {
        const assignee = await tx
          .selectFrom('identity.users')
          .select('platform_role')
          .where('id', '=', patch.assigneeId)
          .where('status', '=', 'active')
          .executeTakeFirst();
        if (
          !assignee?.platform_role ||
          !hasPlatformPermission(assignee.platform_role as PlatformRole, 'complaints.handle')
        ) {
          throw new AppError(
            'VALIDATION_FAILED',
            400,
            'Assign to a team member who handles complaints',
          );
        }
      }
      const status = patch.status ?? (before.status as ComplaintStatus);
      await tx
        .updateTable('support.complaints')
        .set({
          ...(patch.status !== undefined
            ? { status, resolved_at: status === 'resolved' ? new Date() : null }
            : {}),
          ...(patch.assigneeId !== undefined ? { assignee_id: patch.assigneeId } : {}),
        })
        .where('id', '=', id)
        .execute();
      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: caller.userId,
          action: 'complaint.updated',
          targetType: 'complaint',
          targetId: id,
          organizationId: before.organization_id,
          details: {
            before: { status: before.status, assigneeId: before.assignee_id },
            after: {
              status,
              assigneeId: patch.assigneeId !== undefined ? patch.assigneeId : before.assignee_id,
            },
          },
          meta: caller.meta,
        },
        tx,
      );
      return this.adminGet(id, tx);
    });
  }

  async adminReply(
    caller: Caller,
    id: string,
    input: { body: string; internal: boolean },
  ): Promise<AdminComplaint> {
    return this.db.transaction().execute(async (tx) => {
      const complaint = await tx
        .selectFrom('support.complaints')
        .select(['status', 'assignee_id'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!complaint) throw Errors.notFound();
      await tx
        .insertInto('support.complaint_messages')
        .values({
          id: uuidv7(),
          complaint_id: id,
          author_user_id: caller.userId,
          author_kind: 'staff',
          body: input.body,
          internal: input.internal,
        })
        .execute();
      // Working on a new complaint takes it: in progress, and assigned if nobody has it.
      if (complaint.status === 'new' || complaint.assignee_id === null) {
        await tx
          .updateTable('support.complaints')
          .set({
            ...(complaint.status === 'new' ? { status: 'in_progress' } : {}),
            ...(complaint.assignee_id === null ? { assignee_id: caller.userId } : {}),
          })
          .where('id', '=', id)
          .execute();
      }
      return this.adminGet(id, tx);
    });
  }
}
