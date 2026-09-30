import { z } from 'zod';
import { uuidSchema } from './common.js';
import { endpoint } from './endpoint.js';
import { phoneInputSchema } from './identity.js';

/** An IPv4/IPv6 address or CIDR range, e.g. 203.0.113.7 or 203.0.113.0/24. */
const ipOrCidrSchema = z
  .string()
  .trim()
  .max(64)
  .regex(/^[0-9a-fA-F:.]+(\/\d{1,3})?$/, 'Must be an IP address or CIDR range');

export const platformSettingsSchema = z.object({
  /** Default commission on online bookings in basis points (800 = 8%). */
  commissionBps: z.number().int().min(0).max(5000),
  supportWhatsapp: z.string().nullable(),
  /** Shown on the contact page; null hides it (until the domain's mailbox exists). */
  supportEmail: z.string().nullable(),
  /** Owner edits of a published venue's name or photos send it back to review. */
  venueEditsNeedReview: z.boolean(),
  adminIpAllowlist: z.array(z.string()),
  /** The address this request came from (to avoid locking yourself out). */
  yourIp: z.string().nullable(),
  updatedAt: z.string(),
  updatedBy: uuidSchema.nullable(),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

export const adminGetSettings = endpoint({
  method: 'GET',
  path: '/v1/admin/settings',
  summary: 'Platform settings (commission, support contacts, IP allowlist)',
  auth: 'admin',
  permission: 'settings.read',
  response: platformSettingsSchema,
});

export const adminUpdateSettings = endpoint({
  method: 'PATCH',
  path: '/v1/admin/settings',
  summary: 'Change platform settings (owner only, re-authentication, audited)',
  auth: 'admin',
  permission: 'settings.manage',
  body: z
    .object({
      commissionBps: z.number().int().min(0).max(5000).optional(),
      /** Any Jordanian mobile format; stored in international form. */
      supportWhatsapp: phoneInputSchema.nullable().optional(),
      supportEmail: z.string().trim().toLowerCase().email().max(120).nullable().optional(),
      venueEditsNeedReview: z.boolean().optional(),
      adminIpAllowlist: z.array(ipOrCidrSchema).max(50).optional(),
    })
    .strict(),
  response: platformSettingsSchema,
});

export const adminSetVenueCommission = endpoint({
  method: 'PUT',
  path: '/v1/admin/venues/:venueId/commission',
  summary: "Override a venue's commission rate (null: follow the platform default)",
  auth: 'admin',
  permission: 'finance.manage',
  params: z.object({ venueId: uuidSchema }),
  body: z.object({
    commissionBps: z.number().int().min(0).max(5000).nullable(),
    reason: z.string().trim().min(3).max(500),
  }),
  response: z.object({ venueId: uuidSchema, commissionBps: z.number().int().nullable() }),
});
