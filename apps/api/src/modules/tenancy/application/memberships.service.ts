import { Inject, Injectable } from '@nestjs/common';
import type { MembershipRole } from '@jordan-sports/contracts';
import type { Db, DbOrTx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { Errors } from '../../../platform/http/errors.js';
import { hasOrgPermission, type OrgPermission } from '../domain/org-permissions.js';

export interface MyMembership {
  organizationId: string;
  organizationSlug: string;
  organizationName: { ar?: string; en?: string };
  role: MembershipRole;
}

@Injectable()
export class MembershipsService {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  async forUser(userId: string): Promise<MyMembership[]> {
    const rows = await this.db
      .selectFrom('tenancy.memberships as m')
      .innerJoin('tenancy.organizations as o', 'o.id', 'm.organization_id')
      .select(['o.id', 'o.slug', 'o.name', 'm.role'])
      .where('m.user_id', '=', userId)
      .where('o.status', '=', 'active')
      .orderBy('o.slug')
      .execute();
    return rows.map((r) => ({
      organizationId: r.id,
      organizationSlug: r.slug,
      organizationName: r.name as MyMembership['organizationName'],
      role: r.role as MembershipRole,
    }));
  }

  async roleOf(
    userId: string,
    organizationId: string,
    db: DbOrTx = this.db,
  ): Promise<MembershipRole | null> {
    const row = await db
      .selectFrom('tenancy.memberships as m')
      .innerJoin('tenancy.organizations as o', 'o.id', 'm.organization_id')
      .select('m.role')
      .where('m.user_id', '=', userId)
      .where('m.organization_id', '=', organizationId)
      .where('o.status', '=', 'active')
      .executeTakeFirst();
    return (row?.role as MembershipRole | undefined) ?? null;
  }

  /**
   * Tenant authorization (ADR-0008). The organization comes from the database record being
   * accessed, never from client input alone. Non-members get 404 so that other tenants' resources
   * are not even confirmed to exist; members lacking the permission get 403.
   */
  async require(
    userId: string,
    organizationId: string,
    permission: OrgPermission,
  ): Promise<MembershipRole> {
    const role = await this.roleOf(userId, organizationId);
    if (!role) throw Errors.notFound();
    if (!hasOrgPermission(role, permission)) throw Errors.forbidden();
    return role;
  }
}
