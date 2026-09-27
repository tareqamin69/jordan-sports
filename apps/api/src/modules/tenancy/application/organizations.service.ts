import { Inject, Injectable } from '@nestjs/common';
import type {
  LocalizedText,
  MembershipRole,
  Organization,
  OrganizationDetail,
} from '@jordan-sports/contracts';
import type { Db, DbOrTx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { pgConstraint, pgErrorCode, PgError } from '../../../platform/database/errors.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';
import { normalizePhone, UsersService } from '../../identity/index.js';

interface OrgRow {
  id: string;
  slug: string;
  name: unknown;
  status: string;
  created_at: Date;
}

function toOrganization(row: OrgRow): Organization {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name as Organization['name'],
    status: row.status as Organization['status'],
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  async list(options: { limit: number; cursor?: string }) {
    let query = this.db
      .selectFrom('tenancy.organizations')
      .select(['id', 'slug', 'name', 'status', 'created_at'])
      .orderBy('id', 'desc')
      .limit(options.limit + 1);
    if (options.cursor) query = query.where('id', '<', options.cursor);
    const rows = await query.execute();
    const items = rows.slice(0, options.limit).map(toOrganization);
    return { items, nextCursor: rows.length > options.limit ? items.at(-1)!.id : null };
  }

  async get(organizationId: string, db: DbOrTx = this.db): Promise<OrganizationDetail> {
    const org = await db
      .selectFrom('tenancy.organizations')
      .select(['id', 'slug', 'name', 'status', 'created_at'])
      .where('id', '=', organizationId)
      .executeTakeFirst();
    if (!org) throw Errors.notFound();
    const members = await db
      .selectFrom('tenancy.memberships as m')
      .innerJoin('identity.users as u', 'u.id', 'm.user_id')
      .select(['u.id', 'u.display_name', 'u.phone', 'm.role'])
      .where('m.organization_id', '=', organizationId)
      .orderBy('m.created_at')
      .execute();
    return {
      ...toOrganization(org),
      members: members.map((m) => ({
        userId: m.id,
        displayName: m.display_name,
        phone: m.phone,
        role: m.role as MembershipRole,
      })),
    };
  }

  async create(
    adminUserId: string | null,
    input: { slug: string; name: LocalizedText; owner: { phone: string; displayName: string } },
    meta: RequestMeta,
  ): Promise<OrganizationDetail> {
    const phone = normalizePhone(input.owner.phone);
    if (!phone) throw new AppError('INVALID_PHONE', 400);
    try {
      return await this.db.transaction().execute(async (tx) => {
        const organizationId = uuidv7();
        await tx
          .insertInto('tenancy.organizations')
          .values({ id: organizationId, slug: input.slug, name: JSON.stringify(input.name) })
          .execute();
        const owner = await this.users.findOrCreateByPhone(phone, input.owner.displayName, tx);
        await tx
          .insertInto('tenancy.memberships')
          .values({
            id: uuidv7(),
            organization_id: organizationId,
            user_id: owner.id,
            role: 'owner',
          })
          .execute();
        await this.audit.record(
          {
            actorType: adminUserId ? 'admin' : 'system',
            actorUserId: adminUserId,
            action: 'organization.created',
            targetType: 'organization',
            targetId: organizationId,
            organizationId,
            details: { slug: input.slug, ownerUserId: owner.id },
            meta,
          },
          tx,
        );
        return this.get(organizationId, tx);
      });
    } catch (error) {
      if (pgErrorCode(error) === PgError.uniqueViolation && pgConstraint(error)?.includes('slug')) {
        throw Errors.conflict('SLUG_TAKEN');
      }
      throw error;
    }
  }

  async addMember(
    adminUserId: string,
    organizationId: string,
    input: { phone: string; displayName: string; role: MembershipRole },
    meta: RequestMeta,
  ): Promise<OrganizationDetail> {
    const phone = normalizePhone(input.phone);
    if (!phone) throw new AppError('INVALID_PHONE', 400);
    return this.db.transaction().execute(async (tx) => {
      await this.get(organizationId, tx);
      const user = await this.users.findOrCreateByPhone(phone, input.displayName, tx);
      const inserted = await tx
        .insertInto('tenancy.memberships')
        .values({
          id: uuidv7(),
          organization_id: organizationId,
          user_id: user.id,
          role: input.role,
        })
        .onConflict((oc) => oc.columns(['organization_id', 'user_id']).doNothing())
        .executeTakeFirst();
      if (Number(inserted.numInsertedOrUpdatedRows ?? 0n) === 0)
        throw Errors.conflict('ALREADY_MEMBER');
      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: adminUserId,
          action: 'organization.member_added',
          targetType: 'user',
          targetId: user.id,
          organizationId,
          details: { role: input.role },
          meta,
        },
        tx,
      );
      return this.get(organizationId, tx);
    });
  }
}
