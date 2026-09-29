import { z } from 'zod';
import { endpoint } from './endpoint.js';
import { localeSchema, okSchema, page, pageQuerySchema, uuidSchema } from './common.js';

export const phoneInputSchema = z.string().trim().min(6).max(20);
export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/);
export const displayNameSchema = z.string().trim().min(1).max(80);

export const membershipRoleSchema = z.enum(['owner', 'manager', 'staff']);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

/**
 * Two interfaces, one account (plan §2). Presentation only — decides where a fresh sign-up
 * lands and which mode the switch defaults to; venue access is still decided by organization
 * membership (ADR-0008), never by this field.
 */
export const preferredModeSchema = z.enum(['player', 'venue']);
export type PreferredMode = z.infer<typeof preferredModeSchema>;

export const myMembershipSchema = z.object({
  organizationId: uuidSchema,
  organizationSlug: z.string(),
  organizationName: z.object({ ar: z.string().optional(), en: z.string().optional() }),
  role: membershipRoleSchema,
});

export const meSchema = z.object({
  id: uuidSchema,
  phone: z.string().nullable(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  locale: localeSchema,
  preferredMode: preferredModeSchema,
  memberships: z.array(myMembershipSchema),
});
export type Me = z.infer<typeof meSchema>;

const signedIn = z.object({ status: z.literal('signed_in'), user: meSchema });

export const requestOtp = endpoint({
  method: 'POST',
  path: '/v1/auth/otp/request',
  summary: 'Send a one-time sign-in code to a phone number',
  auth: 'public',
  body: z.object({ phone: phoneInputSchema }),
  response: z.object({ phone: z.string(), expiresInSeconds: z.number().int() }),
});

export const verifyOtp = endpoint({
  method: 'POST',
  path: '/v1/auth/otp/verify',
  summary: 'Verify a sign-in code; signs in existing users or returns a sign-up token',
  auth: 'public',
  body: z.object({ phone: phoneInputSchema, code: otpCodeSchema }),
  response: z.discriminatedUnion('status', [
    signedIn,
    z.object({ status: z.literal('profile_required'), signupToken: z.string() }),
  ]),
});

export const completeSignup = endpoint({
  method: 'POST',
  path: '/v1/auth/signup',
  summary: 'Create the account for a verified phone number',
  auth: 'public',
  body: z.object({
    signupToken: z.string().min(20).max(100),
    displayName: displayNameSchema,
    locale: localeSchema,
    // Minimum age 16 (approved product decision): explicit self-attestation.
    ageConfirmed: z.literal(true),
    // "بدك تحجز وتلعب؟" / "عندك ملعب وبدك تضيفه؟" — only decides where the new account lands.
    preferredMode: preferredModeSchema,
  }),
  response: signedIn,
});

export const signOut = endpoint({
  method: 'POST',
  path: '/v1/auth/sign-out',
  summary: 'End the current session',
  auth: 'public',
  response: okSchema,
});

export const getMe = endpoint({
  method: 'GET',
  path: '/v1/me',
  summary: 'The signed-in user',
  auth: 'user',
  response: meSchema,
});

export const updateMe = endpoint({
  method: 'PATCH',
  path: '/v1/me',
  summary: 'Update the signed-in user profile',
  auth: 'user',
  body: z.object({ displayName: displayNameSchema.optional(), locale: localeSchema.optional() }),
  response: meSchema,
});

// ---------------------------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------------------------

export const platformRoleSchema = z.enum(['owner', 'admin', 'support', 'finance']);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

export const adminMeSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  displayName: z.string().nullable(),
  platformRole: platformRoleSchema,
  permissions: z.array(z.string()),
});
export type AdminMe = z.infer<typeof adminMeSchema>;

export const adminSignIn = endpoint({
  method: 'POST',
  path: '/v1/admin/auth/sign-in',
  summary: 'Platform staff sign-in (email, password and authenticator code)',
  auth: 'public',
  body: z.object({
    email: z.string().trim().email().max(200),
    password: z.string().min(1).max(200),
    totpCode: otpCodeSchema,
  }),
  response: adminMeSchema,
});

const staffPasswordSchema = z.string().min(12).max(200);

export const adminReauth = endpoint({
  method: 'POST',
  path: '/v1/admin/auth/reauth',
  summary: 'Confirm password and authenticator code again before a dangerous action',
  auth: 'admin',
  body: z.object({ password: z.string().min(1).max(200), totpCode: otpCodeSchema }),
  response: z.object({ reauthenticatedUntil: z.string() }),
});

export const accountSetupSchema = z.object({
  email: z.string(),
  displayName: z.string().nullable(),
  platformRole: platformRoleSchema,
  /** Authenticator secret to enrol (base32) and the matching otpauth:// URI for a QR code. */
  totpSecret: z.string(),
  otpauthUri: z.string(),
  expiresAt: z.string(),
});
export type AccountSetup = z.infer<typeof accountSetupSchema>;

const setupTokenSchema = z.string().min(20).max(200);

export const inspectAccountSetup = endpoint({
  method: 'POST',
  path: '/v1/admin/setup/inspect',
  summary: 'Details of a one-time staff setup link (owner setup or invitation)',
  auth: 'public',
  body: z.object({ token: setupTokenSchema }),
  response: accountSetupSchema,
});

export const completeAccountSetup = endpoint({
  method: 'POST',
  path: '/v1/admin/setup/complete',
  summary: 'Set the password and confirm the authenticator; signs the staff member in',
  auth: 'public',
  body: z.object({
    token: setupTokenSchema,
    displayName: displayNameSchema,
    password: staffPasswordSchema,
    totpCode: otpCodeSchema,
  }),
  response: adminMeSchema,
});

export const adminSignOut = endpoint({
  method: 'POST',
  path: '/v1/admin/auth/sign-out',
  summary: 'End the admin session',
  auth: 'public',
  response: okSchema,
});

export const getAdminMe = endpoint({
  method: 'GET',
  path: '/v1/admin/me',
  summary: 'The signed-in platform staff member',
  auth: 'admin',
  response: adminMeSchema,
});

export const adminUserSchema = z.object({
  id: uuidSchema,
  phone: z.string().nullable(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  status: z.enum(['active', 'suspended', 'banned']),
  platformRole: platformRoleSchema.nullable(),
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminListUsers = endpoint({
  method: 'GET',
  path: '/v1/admin/users',
  summary: 'Search users',
  auth: 'admin',
  permission: 'users.read',
  query: pageQuerySchema.extend({ q: z.string().trim().max(100).optional() }),
  response: page(adminUserSchema),
});

export const reasonSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const adminSetUserStatus = endpoint({
  method: 'POST',
  path: '/v1/admin/users/:userId/status',
  summary: 'Suspend, ban or reactivate a user (audited, reason required)',
  auth: 'admin',
  permission: 'users.manage',
  params: z.object({ userId: uuidSchema }),
  /** suspended: temporary; banned: permanent. Staff accounts are managed from the team page. */
  body: reasonSchema.extend({ status: z.enum(['active', 'suspended', 'banned']) }),
  response: adminUserSchema,
});

export const reliabilitySchema = z.object({
  bookings: z.number().int(),
  completed: z.number().int(),
  cancelled: z.number().int(),
  lateCancellations: z.number().int(),
  noShows: z.number().int(),
  /** Share of past bookings kept (completed or confirmed), 0–100; null without history. */
  keptPercent: z.number().int().nullable(),
  lastBookingAt: z.string().nullable(),
});

export const adminUserDetailSchema = adminUserSchema.extend({
  locale: z.string(),
  reliability: reliabilitySchema,
  memberships: z.array(
    z.object({
      organizationId: uuidSchema,
      organizationName: z.object({ ar: z.string().optional(), en: z.string().optional() }),
      role: z.string(),
    }),
  ),
  complaints: z.number().int(),
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

export const adminGetUser = endpoint({
  method: 'GET',
  path: '/v1/admin/users/:userId',
  summary: 'A user profile with reliability signals and memberships',
  auth: 'admin',
  permission: 'users.read',
  params: z.object({ userId: uuidSchema }),
  response: adminUserDetailSchema,
});

export const auditLogSchema = z.object({
  id: uuidSchema,
  occurredAt: z.string(),
  actorType: z.enum(['user', 'admin', 'system']),
  actorUserId: uuidSchema.nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  /** The target's name (venue, organization, user, booking reference…) when it can be resolved. */
  targetName: z.object({ ar: z.string().optional(), en: z.string().optional() }).nullable(),
  organizationId: uuidSchema.nullable(),
  reason: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
});
export type AuditLogEntry = z.infer<typeof auditLogSchema>;

export const adminListAuditLogs = endpoint({
  method: 'GET',
  path: '/v1/admin/audit-logs',
  summary: 'Audit log (newest first)',
  auth: 'admin',
  permission: 'audit.read',
  query: pageQuerySchema.extend({
    organizationId: uuidSchema.optional(),
    /** Exact action or a prefix ending in a dot, e.g. `venue.` */
    action: z.string().trim().max(100).optional(),
    actorUserId: uuidSchema.optional(),
    targetType: z.string().trim().max(50).optional(),
    targetId: z.string().trim().max(100).optional(),
    /** Amman dates, inclusive. */
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  response: page(auditLogSchema),
});
