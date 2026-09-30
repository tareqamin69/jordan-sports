import type { MembershipRole, PlatformRole } from './identity.js';

/**
 * Permissions and role bundles — the single source for the API guards, the apps' navigation, the
 * authorization test matrix and docs/rbac-plan.md. Every protected endpoint declares the
 * permission it needs (`permission` for the admin API, `orgPermission` for the venue API).
 */

// ---------------------------------------------------------------------------------------------
// Platform (admin panel)
// ---------------------------------------------------------------------------------------------

export const platformPermissions = [
  'reports.read',
  'revenue.read',
  'venues.read',
  'venues.review',
  'venues.edit',
  'venues.archive',
  'venues.rate',
  'organizations.read',
  'organizations.manage',
  'users.read',
  'users.manage',
  'bookings.read',
  'bookings.cancel',
  'complaints.read',
  'complaints.handle',
  'finance.manage',
  'settings.read',
  'settings.manage',
  'catalog.manage',
  'team.read',
  'team.manage',
  'audit.read',
] as const;
export type PlatformPermission = (typeof platformPermissions)[number];

const everyone: PlatformPermission[] = [
  'reports.read',
  'venues.read',
  'organizations.read',
  'users.read',
  'bookings.read',
  'complaints.read',
];

export const platformRolePermissions: Record<PlatformRole, readonly PlatformPermission[]> = {
  owner: platformPermissions,
  admin: [
    ...everyone,
    'revenue.read',
    'venues.review',
    'venues.edit',
    'organizations.manage',
    'users.manage',
    'bookings.cancel',
    'complaints.handle',
    'settings.read',
    'audit.read',
  ],
  support: [...everyone, 'bookings.cancel', 'complaints.handle'],
  finance: [...everyone, 'revenue.read'],
};

/** Dangerous actions: the session must have re-entered password + authenticator code recently. */
export const reauthPermissions: readonly PlatformPermission[] = [
  'venues.archive',
  'finance.manage',
  'settings.manage',
  'team.manage',
];
export const REAUTH_WINDOW_MINUTES = 10;

export function hasPlatformPermission(role: PlatformRole, permission: PlatformPermission): boolean {
  return platformRolePermissions[role].includes(permission);
}

// ---------------------------------------------------------------------------------------------
// Venue (per organization)
// ---------------------------------------------------------------------------------------------

export const orgPermissions = [
  'venue.read',
  'venue.edit',
  'venue.archive',
  'schedule.hours',
  'schedule.rules',
  'schedule.closures',
  'schedule.block',
  'pricing.read',
  'pricing.manage',
  'booking.read',
  'booking.create',
  'booking.cancel',
  'booking.checkin',
  'payouts.manage',
  'reports.read',
  'staff.manage',
  'complaints.create',
] as const;
export type OrgPermission = (typeof orgPermissions)[number];

export const orgRolePermissions: Record<MembershipRole, readonly OrgPermission[]> = {
  owner: orgPermissions,
  manager: [
    'venue.read',
    'schedule.hours',
    'schedule.closures',
    'schedule.block',
    'pricing.read',
    'pricing.manage',
    'booking.read',
    'booking.create',
    'booking.cancel',
    'booking.checkin',
    'complaints.create',
  ],
  staff: ['venue.read', 'schedule.block', 'booking.read', 'booking.create', 'booking.checkin'],
};

export function hasOrgPermission(role: MembershipRole, permission: OrgPermission): boolean {
  return orgRolePermissions[role].includes(permission);
}
