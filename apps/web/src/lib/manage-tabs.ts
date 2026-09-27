export const tabs = ['calendar', 'hours', 'rules', 'closures'] as const;
export type Tab = (typeof tabs)[number];
