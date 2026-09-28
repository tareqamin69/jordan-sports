import { z } from 'zod';
import { okSchema, uuidSchema } from './common.js';
import { endpoint } from './endpoint.js';
import { displayNameSchema, platformRoleSchema } from './identity.js';

/** Roles the owner can give; there is exactly one owner (handed over from the server only). */
export const staffRoleSchema = z.enum(['admin', 'support', 'finance']);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const teamMemberSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  displayName: z.string().nullable(),
  platformRole: platformRoleSchema,
  status: z.string(),
  lastActiveAt: z.string().nullable(),
  lockedUntil: z.string().nullable(),
  createdAt: z.string(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamInvitationSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  displayName: z.string().nullable(),
  platformRole: platformRoleSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type TeamInvitation = z.infer<typeof teamInvitationSchema>;

export const teamSchema = z.object({
  members: z.array(teamMemberSchema),
  invitations: z.array(teamInvitationSchema),
});
export type Team = z.infer<typeof teamSchema>;

export const adminGetTeam = endpoint({
  method: 'GET',
  path: '/v1/admin/team',
  summary: 'Platform staff and pending invitations (owner only)',
  auth: 'admin',
  permission: 'team.read',
  response: teamSchema,
});

export const adminInviteStaff = endpoint({
  method: 'POST',
  path: '/v1/admin/team/invitations',
  summary: 'Invite a staff member: returns a one-time setup link token, valid 48 hours',
  auth: 'admin',
  permission: 'team.manage',
  body: z.object({
    email: z.string().trim().email().max(200),
    displayName: displayNameSchema.optional(),
    role: staffRoleSchema,
  }),
  response: z.object({ invitation: teamInvitationSchema, token: z.string() }),
});

export const adminRevokeInvitation = endpoint({
  method: 'DELETE',
  path: '/v1/admin/team/invitations/:invitationId',
  summary: 'Cancel a pending staff invitation',
  auth: 'admin',
  permission: 'team.manage',
  params: z.object({ invitationId: uuidSchema }),
  response: okSchema,
});

export const adminChangeStaffRole = endpoint({
  method: 'PUT',
  path: '/v1/admin/team/:userId/role',
  summary: "Change a staff member's role (not the owner's, not your own)",
  auth: 'admin',
  permission: 'team.manage',
  params: z.object({ userId: uuidSchema }),
  body: z.object({ role: staffRoleSchema }),
  response: teamMemberSchema,
});

export const adminRemoveStaff = endpoint({
  method: 'DELETE',
  path: '/v1/admin/team/:userId',
  summary: 'Remove a staff member: their access and sessions end immediately',
  auth: 'admin',
  permission: 'team.manage',
  params: z.object({ userId: uuidSchema }),
  response: okSchema,
});
