import type { PlatformRole } from '@jordan-sports/contracts';

/** Platform (admin) permissions. Roles are code-defined bundles in the MVP (ADR-0009). */
export const platformPermissions = [
  'users.read',
  'users.manage',
  'organizations.read',
  'organizations.manage',
  'catalog.manage',
  'venues.read',
  'venues.manage',
  'bookings.read',
  'audit.read',
  'finance.read',
  'finance.manage',
] as const;
export type PlatformPermission = (typeof platformPermissions)[number];

const read: PlatformPermission[] = [
  'users.read',
  'organizations.read',
  'venues.read',
  'bookings.read',
  'audit.read',
  'finance.read',
];

export const platformRolePermissions: Record<PlatformRole, readonly PlatformPermission[]> = {
  super_admin: platformPermissions,
  admin: platformPermissions,
  support: read,
  finance: [
    'organizations.read',
    'venues.read',
    'bookings.read',
    'audit.read',
    'finance.read',
    'finance.manage',
  ],
};

export function hasPlatformPermission(role: PlatformRole, permission: PlatformPermission): boolean {
  return platformRolePermissions[role].includes(permission);
}
