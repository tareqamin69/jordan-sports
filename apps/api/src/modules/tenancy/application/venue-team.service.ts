import { Inject, Injectable } from '@nestjs/common';
import type { MembershipRole, VenueTeamMember } from '@jordan-sports/contracts';
import type { Db, DbOrTx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';
import { normalizePhone, UsersService } from '../../identity/index.js';

/** Giving someone full control of the venue must be confirmed explicitly (QA #1). */
function ensureOwnerConfirmed(role: MembershipRole, confirmOwner: boolean | undefined): void {
  if (role === 'owner' && confirmOwner !== true) {
    throw new AppError('VALIDATION_FAILED', 400, 'Confirm giving the owner role');
  }
}

interface Caller {
  readonly userId: string;
  readonly meta: RequestMeta;
}

/**
 * A venue owner's team (docs/rbac-plan.md §3). The guard has already checked `staff.manage` in
 * the organization that owns the path's venue or membership.
 */
@Injectable()
export class VenueTeamService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, callerId: string, db: DbOrTx = this.db) {
    const rows = await db
      .selectFrom('tenancy.memberships as m')
      .innerJoin('identity.users as u', 'u.id', 'm.user_id')
      .select(['m.id', 'm.user_id', 'm.role', 'u.display_name', 'u.phone'])
      .where('m.organization_id', '=', organizationId)
      .orderBy('m.created_at')
      .execute();
    return {
      members: rows.map((r): VenueTeamMember => ({
        memberId: r.id,
        userId: r.user_id,
        displayName: r.display_name,
        phone: r.phone,
        role: r.role as MembershipRole,
        isYou: r.user_id === callerId,
      })),
    };
  }

  async add(
    caller: Caller,
    organizationId: string,
    input: {
      phone: string;
      displayName: string;
      role: MembershipRole;
      confirmOwner?: boolean | undefined;
    },
  ) {
    ensureOwnerConfirmed(input.role, input.confirmOwner);
    const phone = normalizePhone(input.phone);
    if (!phone) throw new AppError('INVALID_PHONE', 400);
    return this.db.transaction().execute(async (tx) => {
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
      if (Number(inserted.numInsertedOrUpdatedRows ?? 0n) === 0) {
        throw Errors.conflict('ALREADY_MEMBER');
      }
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: caller.userId,
          action: 'organization.member_added',
          targetType: 'user',
          targetId: user.id,
          organizationId,
          details: { before: null, after: { role: input.role } },
          meta: caller.meta,
        },
        tx,
      );
      return this.list(organizationId, caller.userId, tx);
    });
  }

  /** Locks the membership; refuses changing yourself and removing the last owner. */
  private async target(tx: DbOrTx, caller: Caller, memberId: string) {
    const member = await tx
      .selectFrom('tenancy.memberships')
      .select(['id', 'organization_id', 'user_id', 'role'])
      .where('id', '=', memberId)
      .forUpdate()
      .executeTakeFirst();
    if (!member) throw Errors.notFound();
    if (member.user_id === caller.userId) {
      throw new AppError('FORBIDDEN', 403, 'You cannot change or remove yourself');
    }
    return member;
  }

  private async ensureAnotherOwner(tx: DbOrTx, organizationId: string, memberId: string) {
    const owners = await tx
      .selectFrom('tenancy.memberships')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('role', '=', 'owner')
      .where('id', '!=', memberId)
      .forUpdate()
      .execute();
    if (owners.length === 0) throw Errors.conflict('LAST_OWNER');
  }

  async changeRole(
    caller: Caller,
    memberId: string,
    role: MembershipRole,
    confirmOwner?: boolean | undefined,
  ) {
    ensureOwnerConfirmed(role, confirmOwner);
    return this.db.transaction().execute(async (tx) => {
      const member = await this.target(tx, caller, memberId);
      if (member.role === 'owner' && role !== 'owner') {
        await this.ensureAnotherOwner(tx, member.organization_id, memberId);
      }
      await tx
        .updateTable('tenancy.memberships')
        .set({ role })
        .where('id', '=', memberId)
        .execute();
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: caller.userId,
          action: 'organization.member_role_changed',
          targetType: 'user',
          targetId: member.user_id,
          organizationId: member.organization_id,
          details: { before: { role: member.role }, after: { role } },
          meta: caller.meta,
        },
        tx,
      );
      return this.list(member.organization_id, caller.userId, tx);
    });
  }

  async remove(caller: Caller, memberId: string): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const member = await this.target(tx, caller, memberId);
      if (member.role === 'owner') {
        await this.ensureAnotherOwner(tx, member.organization_id, memberId);
      }
      await tx.deleteFrom('tenancy.memberships').where('id', '=', memberId).execute();
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: caller.userId,
          action: 'organization.member_removed',
          targetType: 'user',
          targetId: member.user_id,
          organizationId: member.organization_id,
          details: { before: { role: member.role }, after: null },
          meta: caller.meta,
        },
        tx,
      );
    });
  }
}
