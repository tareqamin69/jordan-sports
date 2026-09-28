/**
 * Plain data, not `'use client'` — importable from both the wizard (client component) and its
 * server-rendered page (to validate a `?step=` query param), unlike a value re-exported from a
 * client module, which Next's RSC bundling doesn't reliably preserve across that boundary.
 */
export const wizardSteps = ['info', 'location', 'photos', 'courts', 'payment', 'review'] as const;
export type WizardStep = (typeof wizardSteps)[number];
