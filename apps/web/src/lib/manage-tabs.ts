export const tabs = ['calendar', 'hours', 'rules', 'pricing', 'closures'] as const;
export type Tab = (typeof tabs)[number];
