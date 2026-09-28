export const tabs = [
  'calendar',
  'bookings',
  'payments',
  'hours',
  'rules',
  'pricing',
  'closures',
  'balance',
] as const;
export type Tab = (typeof tabs)[number];
