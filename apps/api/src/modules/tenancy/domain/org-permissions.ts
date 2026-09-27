import type { MembershipRole } from '@jordan-sports/contracts';

/** Permissions inside an organization (tenant). Code-defined role bundles (ADR-0008). */
export const orgPermissions = [
  'org.read',
  'venue.read',
  'venue.manage',
  'schedule.manage',
  'schedule.block',
  'pricing.manage',
  'booking.read',
  'booking.manage',
  'staff.manage',
] as const;
export type OrgPermission = (typeof orgPermissions)[number];

export const orgRolePermissions: Record<MembershipRole, readonly OrgPermission[]> = {
  owner: orgPermissions,
  manager: orgPermissions.filter((p) => p !== 'staff.manage'),
  staff: ['org.read', 'venue.read', 'schedule.block', 'booking.read', 'booking.manage'],
};

export function hasOrgPermission(role: MembershipRole, permission: OrgPermission): boolean {
  return orgRolePermissions[role].includes(permission);
}
