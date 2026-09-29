import { Inject, Injectable } from '@nestjs/common';
import type { AuditLogEntry } from '@jordan-sports/contracts';
import { sql } from 'kysely';
import type { Db, DbOrTx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { toCsv } from '../../../platform/http/csv.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';

type TargetName = { ar?: string; en?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditFilters {
  organizationId?: string | undefined;
  action?: string | undefined;
  actorUserId?: string | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export interface AuditEntry {
  readonly actorType: 'user' | 'admin' | 'system';
  readonly actorUserId?: string | null;
  /** Dotted lower-case action, e.g. `organization.created`. */
  readonly action: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly organizationId?: string | null;
  readonly reason?: string | null;
  /** Must not contain secrets, codes or unnecessary personal data. */
  readonly details?: Record<string, unknown>;
  readonly meta?: RequestMeta;
}

/** Append-only audit log (docs/architecture.md §S). Write inside the business transaction. */
@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  async record(entry: AuditEntry, db: DbOrTx = this.db): Promise<void> {
    await db
      .insertInto('audit.audit_logs')
      .values({
        id: uuidv7(),
        actor_type: entry.actorType,
        actor_user_id: entry.actorUserId ?? null,
        action: entry.action,
        target_type: entry.targetType ?? null,
        target_id: entry.targetId ?? null,
        organization_id: entry.organizationId ?? null,
        reason: entry.reason ?? null,
        details: JSON.stringify(entry.details ?? {}),
        ip: entry.meta?.ip ?? null,
        user_agent: entry.meta?.userAgent ?? null,
        request_id: entry.meta?.requestId ?? null,
      })
      .execute();
  }

  async list(
    options: AuditFilters & {
      limit: number;
      cursor?: string | undefined;
    },
  ): Promise<{ items: AuditLogEntry[]; nextCursor: string | null }> {
    let query = this.db
      .selectFrom('audit.audit_logs as a')
      .leftJoin('identity.users as u', 'u.id', 'a.actor_user_id')
      .select([
        'a.id',
        'a.occurred_at',
        'a.actor_type',
        'a.actor_user_id',
        'u.display_name',
        'u.email',
        'a.action',
        'a.target_type',
        'a.target_id',
        'a.organization_id',
        'a.reason',
        'a.details',
      ])
      .orderBy('a.id', 'desc')
      .limit(options.limit + 1);
    if (options.cursor) query = query.where('a.id', '<', options.cursor);
    if (options.organizationId)
      query = query.where('a.organization_id', '=', options.organizationId);
    if (options.action) {
      query = options.action.endsWith('.')
        ? query.where('a.action', 'like', `${options.action.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
        : query.where('a.action', '=', options.action);
    }
    if (options.actorUserId) query = query.where('a.actor_user_id', '=', options.actorUserId);
    if (options.targetType) query = query.where('a.target_type', '=', options.targetType);
    if (options.targetId) query = query.where('a.target_id', '=', options.targetId);
    if (options.from) {
      query = query.where(
        sql<boolean>`(a.occurred_at AT TIME ZONE 'Asia/Amman')::date >= ${options.from}::date`,
      );
    }
    if (options.to) {
      query = query.where(
        sql<boolean>`(a.occurred_at AT TIME ZONE 'Asia/Amman')::date <= ${options.to}::date`,
      );
    }
    const rows = await query.execute();
    const names = await this.targetNames(rows.slice(0, options.limit));
    const items = rows.slice(0, options.limit).map((r) => ({
      id: r.id,
      occurredAt: r.occurred_at.toISOString(),
      actorType: r.actor_type as AuditLogEntry['actorType'],
      actorUserId: r.actor_user_id,
      actorName: r.display_name ?? r.email ?? null,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      targetName: names.get(`${r.target_type}:${r.target_id}`) ?? null,
      organizationId: r.organization_id,
      reason: r.reason,
      details: (r.details ?? {}) as Record<string, unknown>,
    }));
    return { items, nextCursor: rows.length > options.limit ? items.at(-1)!.id : null };
  }

  /** Resolves the display name of each entry's target (one query per target type). */
  private async targetNames(
    rows: ReadonlyArray<{ target_type: string | null; target_id: string | null }>,
  ): Promise<Map<string, TargetName>> {
    const byType = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!r.target_type || !r.target_id || !UUID.test(r.target_id)) continue;
      byType.set(r.target_type, (byType.get(r.target_type) ?? new Set()).add(r.target_id));
    }
    const out = new Map<string, TargetName>();
    const put = (type: string, id: string, name: TargetName) => out.set(`${type}:${id}`, name);
    const ids = (type: string) => [...(byType.get(type) ?? [])];
    const same = (n: string | null): TargetName => (n ? { ar: n, en: n } : {});
    if (ids('venue').length) {
      for (const v of await this.db
        .selectFrom('venue.venues')
        .select(['id', 'name'])
        .where('id', 'in', ids('venue'))
        .execute()) {
        put('venue', v.id, v.name as TargetName);
      }
    }
    if (ids('organization').length) {
      for (const o of await this.db
        .selectFrom('tenancy.organizations')
        .select(['id', 'name'])
        .where('id', 'in', ids('organization'))
        .execute()) {
        put('organization', o.id, o.name as TargetName);
      }
    }
    if (ids('user').length) {
      for (const u of await this.db
        .selectFrom('identity.users')
        .select(['id', 'display_name', 'email', 'phone'])
        .where('id', 'in', ids('user'))
        .execute()) {
        put('user', u.id, same(u.display_name ?? u.email ?? u.phone));
      }
    }
    if (ids('booking').length) {
      for (const b of await this.db
        .selectFrom('booking.bookings')
        .select(['id', 'reference'])
        .where('id', 'in', ids('booking'))
        .execute()) {
        put('booking', b.id, same(b.reference));
      }
    }
    if (ids('complaint').length) {
      for (const c of await this.db
        .selectFrom('support.complaints')
        .select(['id', 'reference'])
        .where('id', 'in', ids('complaint'))
        .execute()) {
        put('complaint', c.id, same(c.reference));
      }
    }
    if (ids('resource').length) {
      for (const r of await this.db
        .selectFrom('resource.resources')
        .select(['id', 'name'])
        .where('id', 'in', ids('resource'))
        .execute()) {
        put('resource', r.id, r.name as TargetName);
      }
    }
    if (ids('setup_link').length) {
      for (const l of await this.db
        .selectFrom('identity.account_setup_tokens')
        .select(['id', 'email'])
        .where('id', 'in', ids('setup_link'))
        .execute()) {
        put('setup_link', l.id, same(l.email));
      }
    }
    return out;
  }

  /** CSV export with the list's filters (newest first, at most 20,000 rows). */
  async csv(filters: AuditFilters): Promise<string> {
    const { items } = await this.list({ ...filters, limit: 20_000 });
    return toCsv(
      [
        'occurred_at',
        'actor_type',
        'actor',
        'actor_user_id',
        'action',
        'target_type',
        'target_id',
        'target_name',
        'organization_id',
        'reason',
        'details',
      ],
      items.map((e) => [
        e.occurredAt,
        e.actorType,
        e.actorName,
        e.actorUserId,
        e.action,
        e.targetType,
        e.targetId,
        e.targetName?.ar ?? e.targetName?.en ?? null,
        e.organizationId,
        e.reason,
        e.details,
      ]),
    );
  }
}
