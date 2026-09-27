import { z } from 'zod';
import { endpoint } from './endpoint.js';
import { localizedTextSchema, page, pageQuerySchema, slugSchema, uuidSchema } from './common.js';
import { displayNameSchema, membershipRoleSchema, phoneInputSchema } from './identity.js';

export const organizationSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.object({ ar: z.string().optional(), en: z.string().optional() }),
  status: z.enum(['active', 'suspended']),
  createdAt: z.string(),
});
export type Organization = z.infer<typeof organizationSchema>;

export const memberSchema = z.object({
  userId: uuidSchema,
  displayName: z.string().nullable(),
  phone: z.string().nullable(),
  role: membershipRoleSchema,
});

export const organizationDetailSchema = organizationSchema.extend({
  members: z.array(memberSchema),
});
export type OrganizationDetail = z.infer<typeof organizationDetailSchema>;

export const adminListOrganizations = endpoint({
  method: 'GET',
  path: '/v1/admin/organizations',
  summary: 'List organizations',
  auth: 'admin',
  query: pageQuerySchema,
  response: page(organizationSchema),
});

export const adminCreateOrganization = endpoint({
  method: 'POST',
  path: '/v1/admin/organizations',
  summary: 'Create an organization and its owner (pilot onboarding is admin-created)',
  auth: 'admin',
  body: z.object({
    slug: slugSchema,
    name: localizedTextSchema(120),
    owner: z.object({ phone: phoneInputSchema, displayName: displayNameSchema }),
  }),
  response: organizationDetailSchema,
});

export const adminGetOrganization = endpoint({
  method: 'GET',
  path: '/v1/admin/organizations/:organizationId',
  summary: 'Organization with members',
  auth: 'admin',
  params: z.object({ organizationId: uuidSchema }),
  response: organizationDetailSchema,
});

export const adminAddMember = endpoint({
  method: 'POST',
  path: '/v1/admin/organizations/:organizationId/members',
  summary: 'Add a member by phone number',
  auth: 'admin',
  params: z.object({ organizationId: uuidSchema }),
  body: z.object({
    phone: phoneInputSchema,
    displayName: displayNameSchema,
    role: membershipRoleSchema,
  }),
  response: organizationDetailSchema,
});
