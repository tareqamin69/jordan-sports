import { BlockList, isIP } from 'node:net';
import { Inject, Injectable } from '@nestjs/common';
import type { PlatformSettings } from '@jordan-sports/contracts';
import type { AppConfig } from '../../../platform/config/config.js';
import { APP_CONFIG } from '../../../platform/config/config.module.js';
import type { Db } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { AppError } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';
import { normalizePhone } from '../../identity/domain/phone.js';

/** Several API processes may run: a short cache keeps settings changes visible within seconds. */
const CACHE_MS = 5_000;

interface Loaded {
  commissionBps: number;
  supportWhatsapp: string | null;
  features: { cliqPayments: boolean | null };
  adminIpAllowlist: string[];
  updatedAt: Date;
  updatedBy: string | null;
  allowlist: BlockList | null;
}

export type SettingsPatch = {
  commissionBps?: number | undefined;
  supportWhatsapp?: string | null | undefined;
  features?: { cliqPayments?: boolean | null | undefined } | undefined;
  adminIpAllowlist?: string[] | undefined;
};

/** Builds a matcher; throws VALIDATION_FAILED on an invalid entry. */
export function parseAllowlist(entries: readonly string[]): BlockList | null {
  if (entries.length === 0) return null;
  const list = new BlockList();
  for (const entry of entries) {
    const [address = '', bits] = entry.split('/');
    const family = isIP(address);
    if (family === 0) throw new AppError('VALIDATION_FAILED', 400, `Invalid address: ${entry}`);
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (bits === undefined) {
      list.addAddress(address, type);
    } else {
      const prefix = Number(bits);
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128)) {
        throw new AppError('VALIDATION_FAILED', 400, `Invalid range: ${entry}`);
      }
      list.addSubnet(address, prefix, type);
    }
  }
  return list;
}

function matches(list: BlockList, ip: string | null): boolean {
  if (!ip) return false;
  const plain = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const family = isIP(plain);
  if (family === 0) return false;
  return list.check(plain, family === 4 ? 'ipv4' : 'ipv6');
}

/**
 * Platform settings managed by the owner (docs/rbac-plan.md §7). Feature flags fall back to the
 * server environment when not set. Every change is audited with before/after values.
 */
@Injectable()
export class SettingsService {
  private cached: { at: number; value: Loaded } | undefined;

  constructor(
    @Inject(DATABASE) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  private async load(): Promise<Loaded> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.value;
    const row = await this.db.selectFrom('platform.settings').selectAll().executeTakeFirstOrThrow();
    const features = (row.features ?? {}) as { cliqPayments?: boolean | null };
    const value: Loaded = {
      commissionBps: row.commission_bps,
      supportWhatsapp: row.support_whatsapp,
      features: { cliqPayments: features.cliqPayments ?? null },
      adminIpAllowlist: row.admin_ip_allowlist,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
      allowlist: parseAllowlist(row.admin_ip_allowlist),
    };
    this.cached = { at: Date.now(), value };
    return value;
  }

  invalidate(): void {
    this.cached = undefined;
  }

  async cliqPayments(): Promise<boolean> {
    return (await this.load()).features.cliqPayments ?? this.config.features.cliqPayments;
  }

  async supportWhatsapp(): Promise<string | null> {
    return (await this.load()).supportWhatsapp;
  }

  /** True when the admin panel may be used from this address (no allowlist: everywhere). */
  async adminIpAllowed(ip: string | null): Promise<boolean> {
    const { allowlist } = await this.load();
    return allowlist === null || matches(allowlist, ip);
  }

  async view(yourIp: string | null): Promise<PlatformSettings> {
    const s = await this.load();
    return {
      commissionBps: s.commissionBps,
      supportWhatsapp: s.supportWhatsapp,
      features: s.features,
      effectiveFeatures: {
        cliqPayments: s.features.cliqPayments ?? this.config.features.cliqPayments,
      },
      adminIpAllowlist: s.adminIpAllowlist,
      yourIp,
      updatedAt: s.updatedAt.toISOString(),
      updatedBy: s.updatedBy,
    };
  }

  async update(
    actor: { userId: string; meta: RequestMeta },
    patch: SettingsPatch,
  ): Promise<PlatformSettings> {
    let whatsapp: string | null | undefined = undefined;
    if (patch.supportWhatsapp !== undefined) {
      whatsapp = patch.supportWhatsapp === null ? null : normalizePhone(patch.supportWhatsapp);
      if (whatsapp === null && patch.supportWhatsapp !== null) {
        throw new AppError('INVALID_PHONE', 400);
      }
    }
    if (patch.adminIpAllowlist !== undefined) {
      const list = parseAllowlist(patch.adminIpAllowlist);
      // Refuse a list that would lock out the person saving it.
      if (list && !matches(list, actor.meta.ip)) {
        throw new AppError(
          'VALIDATION_FAILED',
          400,
          'The allowlist must include the address you are using now',
        );
      }
    }

    await this.db.transaction().execute(async (tx) => {
      const before = await tx
        .selectFrom('platform.settings')
        .selectAll()
        .forUpdate()
        .executeTakeFirstOrThrow();
      const beforeFeatures = (before.features ?? {}) as Record<string, unknown>;
      const features =
        patch.features === undefined
          ? beforeFeatures
          : Object.fromEntries(
              Object.entries({ ...beforeFeatures, ...patch.features }).filter(
                ([, v]) => v !== undefined,
              ),
            );
      const after = await tx
        .updateTable('platform.settings')
        .set({
          ...(patch.commissionBps !== undefined ? { commission_bps: patch.commissionBps } : {}),
          ...(whatsapp !== undefined ? { support_whatsapp: whatsapp } : {}),
          ...(patch.features !== undefined ? { features: JSON.stringify(features) } : {}),
          ...(patch.adminIpAllowlist !== undefined
            ? { admin_ip_allowlist: patch.adminIpAllowlist }
            : {}),
          updated_at: new Date(),
          updated_by: actor.userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const snapshot = (r: typeof before) => ({
        commissionBps: r.commission_bps,
        supportWhatsapp: r.support_whatsapp,
        features: r.features,
        adminIpAllowlist: r.admin_ip_allowlist,
      });
      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: actor.userId,
          action: 'settings.updated',
          targetType: 'settings',
          targetId: 'platform',
          details: { before: snapshot(before), after: snapshot(after) },
          meta: actor.meta,
        },
        tx,
      );
    });
    this.invalidate();
    return this.view(actor.meta.ip);
  }

  /** Server command line only: removes the admin IP allowlist (recovery from a lockout). */
  async clearAdminIpAllowlist(): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const before = await tx
        .selectFrom('platform.settings')
        .select('admin_ip_allowlist')
        .forUpdate()
        .executeTakeFirstOrThrow();
      await tx
        .updateTable('platform.settings')
        .set({ admin_ip_allowlist: [], updated_at: new Date(), updated_by: null })
        .execute();
      await this.audit.record(
        {
          actorType: 'system',
          action: 'settings.ip_allowlist_cleared',
          targetType: 'settings',
          targetId: 'platform',
          details: { before: before.admin_ip_allowlist, after: [] },
        },
        tx,
      );
    });
    this.invalidate();
  }

  /** Owner: a venue's own commission rate, or null to follow the platform default. */
  async setVenueCommission(
    actor: { userId: string; meta: RequestMeta },
    venueId: string,
    commissionBps: number | null,
    reason: string,
  ): Promise<{ venueId: string; commissionBps: number | null }> {
    return this.db.transaction().execute(async (tx) => {
      const venue = await tx
        .selectFrom('venue.venues')
        .select(['id', 'organization_id', 'commission_bps'])
        .where('id', '=', venueId)
        .where('archived_at', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!venue) throw new AppError('NOT_FOUND', 404);
      await tx
        .updateTable('venue.venues')
        .set({ commission_bps: commissionBps })
        .where('id', '=', venueId)
        .execute();
      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: actor.userId,
          action: 'venue.commission_changed',
          targetType: 'venue',
          targetId: venueId,
          organizationId: venue.organization_id,
          reason,
          details: { before: venue.commission_bps, after: commissionBps },
          meta: actor.meta,
        },
        tx,
      );
      return { venueId, commissionBps };
    });
  }
}
