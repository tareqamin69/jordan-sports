import { Inject, Injectable } from '@nestjs/common';
import type { AuditLogEntry } from '@jordan-sports/contracts';
import { sql } from 'kysely';
import type { Db, DbOrTx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { toCsv } from '../../../platform/http/csv.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';

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
    const items = rows.slice(0, options.limit).map((r) => ({
      id: r.id,
      occurredAt: r.occurred_at.toISOString(),
      actorType: r.actor_type as AuditLogEntry['actorType'],
      actorUserId: r.actor_user_id,
      actorName: r.display_name ?? r.email ?? null,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      organizationId: r.organization_id,
      reason: r.reason,
      details: (r.details ?? {}) as Record<string, unknown>,
    }));
    return { items, nextCursor: rows.length > options.limit ? items.at(-1)!.id : null };
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
        e.organizationId,
        e.reason,
        e.details,
      ]),
    );
  }
}
