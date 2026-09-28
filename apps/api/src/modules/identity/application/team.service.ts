import { Inject, Injectable } from '@nestjs/common';
import type {
  PlatformRole,
  StaffRole,
  Team,
  TeamInvitation,
  TeamMember,
} from '@jordan-sports/contracts';
import type { Db, DbOrTx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';
import { StaffSetupService } from './staff-setup.service.js';

interface Caller {
  readonly userId: string;
  readonly meta: RequestMeta;
}

/** The owner's admin team (docs/rbac-plan.md §8): invite, change role, remove. */
@Injectable()
export class TeamService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly setup: StaffSetupService,
    private readonly audit: AuditService,
  ) {}

  private membersQuery(db: DbOrTx) {
    return db
      .selectFrom('identity.users as u')
      .select((eb) => [
        'u.id',
        'u.email',
        'u.display_name',
        'u.platform_role',
        'u.status',
        'u.locked_until',
        'u.created_at',
        eb
          .selectFrom('identity.sessions as s')
          .select((e) => e.fn.max('s.last_seen_at').as('last'))
          .whereRef('s.user_id', '=', 'u.id')
          .where('s.kind', '=', 'admin')
          .as('last_active_at'),
      ])
      .where('u.platform_role', 'is not', null);
  }

  private toMember(
    r: Awaited<ReturnType<ReturnType<TeamService['membersQuery']>['executeTakeFirstOrThrow']>>,
  ): TeamMember {
    return {
      id: r.id,
      email: r.email ?? '',
      displayName: r.display_name,
      platformRole: r.platform_role as PlatformRole,
      status: r.status,
      lastActiveAt: r.last_active_at ? new Date(r.last_active_at).toISOString() : null,
      lockedUntil:
        r.locked_until && r.locked_until.getTime() > Date.now()
          ? r.locked_until.toISOString()
          : null,
      createdAt: r.created_at.toISOString(),
    };
  }

  async list(): Promise<Team> {
    const members = await this.membersQuery(this.db).orderBy('u.created_at').execute();
    const invitations = await this.db
      .selectFrom('identity.account_setup_tokens')
      .selectAll()
      .where('purpose', '=', 'staff_invite')
      .where('used_at', 'is', null)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc')
      .execute();
    return {
      members: members.map((m) => this.toMember(m)),
      invitations: invitations.map((i): TeamInvitation => ({
        id: i.id,
        email: i.email,
        displayName: i.display_name,
        platformRole: i.platform_role as PlatformRole,
        expiresAt: i.expires_at.toISOString(),
        createdAt: i.created_at.toISOString(),
      })),
    };
  }

  async invite(
    caller: Caller,
    input: { email: string; displayName?: string | undefined; role: StaffRole },
  ): Promise<{ invitation: TeamInvitation; token: string }> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.db
      .selectFrom('identity.users')
      .select(['platform_role'])
      .where('email', '=', email)
      .executeTakeFirst();
    if (existing?.platform_role) throw new AppError('ALREADY_MEMBER', 409);
    if (existing) {
      throw new AppError('VALIDATION_FAILED', 400, 'This email belongs to a player account');
    }
    const link = await this.setup.createLink({
      purpose: 'staff_invite',
      email,
      role: input.role,
      displayName: input.displayName ?? null,
      createdBy: caller.userId,
      meta: caller.meta,
    });
    return {
      token: link.token,
      invitation: {
        id: link.id,
        email,
        displayName: input.displayName ?? null,
        platformRole: input.role,
        expiresAt: link.expiresAt.toISOString(),
        createdAt: new Date().toISOString(),
      },
    };
  }

  async revokeInvitation(caller: Caller, invitationId: string): Promise<void> {
    const revoked = await this.db
      .updateTable('identity.account_setup_tokens')
      .set({ revoked_at: new Date() })
      .where('id', '=', invitationId)
      .where('purpose', '=', 'staff_invite')
      .where('used_at', 'is', null)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (Number(revoked.numUpdatedRows) !== 1) throw Errors.notFound();
    await this.audit.record({
      actorType: 'admin',
      actorUserId: caller.userId,
      action: 'admin.invitation_revoked',
      targetType: 'setup_link',
      targetId: invitationId,
      meta: caller.meta,
    });
  }

  /** Locks the target staff row; the owner and the caller themselves can't be changed here. */
  private async target(tx: DbOrTx, caller: Caller, userId: string) {
    const user = await tx
      .selectFrom('identity.users')
      .select(['id', 'platform_role', 'email'])
      .where('id', '=', userId)
      .where('platform_role', 'is not', null)
      .forUpdate()
      .executeTakeFirst();
    if (!user) throw Errors.notFound();
    if (user.platform_role === 'owner' || user.id === caller.userId) {
      throw new AppError('FORBIDDEN', 403, 'The owner and your own account cannot be changed here');
    }
    return user;
  }

  async changeRole(caller: Caller, userId: string, role: StaffRole): Promise<TeamMember> {
    return this.db.transaction().execute(async (tx) => {
      const user = await this.target(tx, caller, userId);
      await tx
        .updateTable('identity.users')
        .set({ platform_role: role })
        .where('id', '=', userId)
        .execute();
      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: caller.userId,
          action: 'admin.role_changed',
          targetType: 'user',
          targetId: userId,
          details: { before: { role: user.platform_role }, after: { role } },
          meta: caller.meta,
        },
        tx,
      );
      return this.toMember(
        await this.membersQuery(tx).where('u.id', '=', userId).executeTakeFirstOrThrow(),
      );
    });
  }

  /** Removes platform access (the account keeps its history for the audit log). */
  async remove(caller: Caller, userId: string): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const user = await this.target(tx, caller, userId);
      await tx
        .updateTable('identity.users')
        .set({ platform_role: null })
        .where('id', '=', userId)
        .execute();
      await tx
        .updateTable('identity.sessions')
        .set({ revoked_at: new Date() })
        .where('user_id', '=', userId)
        .where('revoked_at', 'is', null)
        .execute();
      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: caller.userId,
          action: 'admin.removed',
          targetType: 'user',
          targetId: userId,
          details: { email: user.email, before: { role: user.platform_role }, after: null },
          meta: caller.meta,
        },
        tx,
      );
    });
  }
}
