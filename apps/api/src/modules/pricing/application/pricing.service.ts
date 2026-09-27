import { Inject, Injectable } from '@nestjs/common';
import type { PriceRuleView, VenuePricing } from '@jordan-sports/contracts';
import type { Db, DbOrTx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';
import { ResourcesService } from '../../resources/index.js';
import { addDays, localToInstant, parseTime } from '../../scheduling/index.js';
import { VenueAccessService, type VenueRow } from '../../venues/index.js';
import { quote, slotPosition, type PriceRule, type Quote } from '../domain/quote.js';

export interface RuleInput {
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  dateFrom: string | null;
  dateTo: string | null;
  priority: number;
  label: string | null;
  amounts: Array<{ durationMinutes: number; amount: number }>;
}

export interface StaffActor {
  readonly userId: string;
  readonly meta: RequestMeta;
}

interface StoredRule extends PriceRule {
  readonly resourceId: string;
  readonly label: string | null;
}

function toView(r: StoredRule): PriceRuleView {
  return {
    id: r.id,
    resourceId: r.resourceId,
    daysOfWeek: [...r.daysOfWeek],
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    dateFrom: r.dateFrom,
    dateTo: r.dateTo,
    priority: r.priority,
    label: r.label,
    currency: r.currency,
    amounts: [...r.amounts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([durationMinutes, amount]) => ({ durationMinutes, amount })),
    createdAt: r.createdAt.toISOString(),
  };
}

/** Price rules and quotes (docs/architecture.md §H, ADR-0014). */
@Injectable()
export class PricingService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly access: VenueAccessService,
    private readonly resources: ResourcesService,
    private readonly audit: AuditService,
  ) {}

  /** Active rules per resource. */
  async rulesFor(
    resourceIds: readonly string[],
    db: DbOrTx = this.db,
  ): Promise<Map<string, StoredRule[]>> {
    const map = new Map<string, StoredRule[]>(resourceIds.map((id) => [id, []]));
    if (resourceIds.length === 0) return map;
    const rules = await db
      .selectFrom('pricing.price_rules')
      .selectAll()
      .where('resource_id', 'in', resourceIds)
      .where('archived_at', 'is', null)
      .execute();
    if (rules.length === 0) return map;
    const amounts = await db
      .selectFrom('pricing.price_rule_amounts')
      .selectAll()
      .where(
        'rule_id',
        'in',
        rules.map((r) => r.id),
      )
      .execute();
    for (const r of rules) {
      map.get(r.resource_id)?.push({
        id: r.id,
        resourceId: r.resource_id,
        daysOfWeek: r.days_of_week,
        startMinute: r.start_minute,
        endMinute: r.end_minute,
        dateFrom: r.date_from,
        dateTo: r.date_to,
        priority: r.priority,
        currency: r.currency,
        label: r.label,
        createdAt: r.created_at,
        amounts: new Map(
          amounts
            .filter((a) => a.rule_id === r.id)
            .map((a) => [a.duration_minutes, Number(a.amount)]),
        ),
      });
    }
    return map;
  }

  quoteSlot(
    venue: VenueRow,
    rules: readonly PriceRule[],
    start: Date,
    durationMinutes: number,
    businessDate: string,
  ): Quote | null {
    const q = quote(rules, slotPosition(start, durationMinutes, businessDate, venue.timezone));
    return q && q.currency === venue.currency ? q : null;
  }

  async pricing(userId: string, venueId: string): Promise<VenuePricing> {
    const { venue } = await this.access.require(userId, venueId, 'venue.read');
    return this.view(venue);
  }

  private async view(venue: VenueRow): Promise<VenuePricing> {
    const resources = await this.resources.listForVenue(venue.id);
    const rules = await this.rulesFor(resources.map((r) => r.id));
    return {
      currency: venue.currency,
      rules: [...rules.values()]
        .flat()
        .sort(
          (a, b) => a.startMinute - b.startMinute || a.createdAt.getTime() - b.createdAt.getTime(),
        )
        .map(toView),
    };
  }

  private async insertRule(
    tx: DbOrTx,
    venue: VenueRow,
    resourceId: string,
    rule: RuleInput,
    userId: string,
  ): Promise<string> {
    const id = uuidv7();
    await tx
      .insertInto('pricing.price_rules')
      .values({
        id,
        venue_id: venue.id,
        resource_id: resourceId,
        days_of_week: [...new Set(rule.daysOfWeek)].sort(),
        start_minute: rule.startMinute,
        end_minute: rule.endMinute,
        date_from: rule.dateFrom,
        date_to: rule.dateTo,
        priority: rule.priority,
        currency: venue.currency,
        label: rule.label,
        created_by: userId,
      })
      .execute();
    const durations = new Set<number>();
    for (const a of rule.amounts) {
      if (durations.has(a.durationMinutes))
        throw new AppError('VALIDATION_FAILED', 400, 'Duplicate duration');
      durations.add(a.durationMinutes);
    }
    await tx
      .insertInto('pricing.price_rule_amounts')
      .values(
        rule.amounts.map((a) => ({
          rule_id: id,
          duration_minutes: a.durationMinutes,
          amount: String(a.amount),
        })),
      )
      .execute();
    return id;
  }

  async create(
    actor: StaffActor,
    venueId: string,
    resourceIds: string[],
    rule: RuleInput,
  ): Promise<VenuePricing> {
    const { venue } = await this.access.require(actor.userId, venueId, 'pricing.manage');
    const venueResources = new Set((await this.resources.listForVenue(venueId)).map((r) => r.id));
    if (!resourceIds.every((id) => venueResources.has(id))) throw Errors.notFound();
    await this.db.transaction().execute(async (tx) => {
      const ids: string[] = [];
      for (const resourceId of new Set(resourceIds))
        ids.push(await this.insertRule(tx, venue, resourceId, rule, actor.userId));
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: 'pricing.rules_created',
          targetType: 'venue',
          targetId: venueId,
          organizationId: venue.organizationId,
          details: { ruleIds: ids, ...rule },
          meta: actor.meta,
        },
        tx,
      );
    });
    return this.view(venue);
  }

  private async ruleVenue(ruleId: string) {
    const row = await this.db
      .selectFrom('pricing.price_rules')
      .select(['venue_id', 'resource_id', 'archived_at'])
      .where('id', '=', ruleId)
      .executeTakeFirst();
    if (!row) throw Errors.notFound();
    return row;
  }

  /** Rules are immutable: replacing archives the old rule and creates a new one (ADR-0006 auditability). */
  async replace(actor: StaffActor, ruleId: string, rule: RuleInput): Promise<VenuePricing> {
    const row = await this.ruleVenue(ruleId);
    const { venue } = await this.access.require(actor.userId, row.venue_id, 'pricing.manage');
    if (row.archived_at)
      throw new AppError('INVALID_STATE_TRANSITION', 409, 'Rule already archived');
    await this.db.transaction().execute(async (tx) => {
      const archived = await tx
        .updateTable('pricing.price_rules')
        .set({ archived_at: new Date() })
        .where('id', '=', ruleId)
        .where('archived_at', 'is', null)
        .executeTakeFirst();
      if (Number(archived.numUpdatedRows) !== 1)
        throw new AppError('INVALID_STATE_TRANSITION', 409);
      const newId = await this.insertRule(tx, venue, row.resource_id, rule, actor.userId);
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: 'pricing.rule_replaced',
          targetType: 'price_rule',
          targetId: newId,
          organizationId: venue.organizationId,
          details: { replaces: ruleId, ...rule },
          meta: actor.meta,
        },
        tx,
      );
    });
    return this.view(venue);
  }

  async archive(actor: StaffActor, ruleId: string): Promise<VenuePricing> {
    const row = await this.ruleVenue(ruleId);
    const { venue } = await this.access.require(actor.userId, row.venue_id, 'pricing.manage');
    await this.db.transaction().execute(async (tx) => {
      await tx
        .updateTable('pricing.price_rules')
        .set({ archived_at: new Date() })
        .where('id', '=', ruleId)
        .where('archived_at', 'is', null)
        .execute();
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: 'pricing.rule_archived',
          targetType: 'price_rule',
          targetId: ruleId,
          organizationId: venue.organizationId,
          meta: actor.meta,
        },
        tx,
      );
    });
    return this.view(venue);
  }

  /** Price preview for staff: business date + venue-local start time. */
  async preview(
    userId: string,
    resourceId: string,
    date: string,
    startTime: string,
    durationMinutes: number,
  ) {
    const resource = await this.resources.find(resourceId);
    const { venue } = await this.access.require(userId, resource.venueId, 'venue.read');
    const minute = parseTime(startTime);
    const calendarDate = minute < venue.businessDayStartMinute ? addDays(date, 1) : date;
    const start = localToInstant(calendarDate, minute, venue.timezone);
    const rules = (await this.rulesFor([resourceId])).get(resourceId) ?? [];
    const q = this.quoteSlot(venue, rules, start, durationMinutes, date);
    return {
      price: q ? { amount: q.amount, currency: q.currency } : null,
      ruleId: q?.ruleId ?? null,
    };
  }
}
