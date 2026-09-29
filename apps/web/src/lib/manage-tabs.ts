import type { OrgPermission } from '@jordan-sports/contracts';

export const tabs = [
  'today',
  'calendar',
  'bookings',
  'payments',
  'hours',
  'rules',
  'pricing',
  'closures',
  'balance',
  'support',
  'team',
  'reports',
  'settings',
] as const;
export type Tab = (typeof tabs)[number];

/** What a role needs to see each tab (docs/rbac-plan.md §3); the API enforces the same. */
export const tabPermission: Record<Tab, OrgPermission> = {
  calendar: 'booking.read',
  bookings: 'booking.read',
  payments: 'payments.manage',
  hours: 'schedule.hours',
  rules: 'schedule.rules',
  pricing: 'pricing.read',
  closures: 'schedule.closures',
  balance: 'reports.read',
  support: 'complaints.create',
  today: 'booking.read',
  team: 'staff.manage',
  reports: 'reports.read',
  settings: 'venue.edit',
};
