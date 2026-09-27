export const tabs = ['calendar', 'bookings', 'hours', 'rules', 'pricing', 'closures'] as const;
export type Tab = (typeof tabs)[number];
