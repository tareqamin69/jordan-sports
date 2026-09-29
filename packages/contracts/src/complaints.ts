import { z } from 'zod';
import { page, pageQuerySchema, uuidSchema } from './common.js';
import { endpoint } from './endpoint.js';
import { localizedSchema } from './catalog.js';

export const complaintCategorySchema = z.enum([
  'booking',
  'venue',
  'payment',
  'app',
  'player_behaviour',
  'other',
]);
export type ComplaintCategory = z.infer<typeof complaintCategorySchema>;

export const complaintStatusSchema = z.enum(['new', 'in_progress', 'resolved']);
export type ComplaintStatus = z.infer<typeof complaintStatusSchema>;

export const complaintMessageSchema = z.object({
  id: uuidSchema,
  authorKind: z.enum(['reporter', 'staff']),
  /** Staff names are shown to the reporter as "platform support" only. */
  authorName: z.string().nullable(),
  body: z.string(),
  internal: z.boolean(),
  createdAt: z.string(),
});
export type ComplaintMessage = z.infer<typeof complaintMessageSchema>;

export const complaintSchema = z.object({
  id: uuidSchema,
  reference: z.string(),
  reporterKind: z.enum(['player', 'venue']),
  category: complaintCategorySchema,
  status: complaintStatusSchema,
  body: z.string(),
  venue: z.object({ id: uuidSchema, name: localizedSchema }).nullable(),
  bookingReference: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
  messages: z.array(complaintMessageSchema),
});
export type Complaint = z.infer<typeof complaintSchema>;

export const adminComplaintSchema = complaintSchema.extend({
  reporter: z.object({
    id: uuidSchema,
    name: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  assignee: z.object({ id: uuidSchema, name: z.string().nullable() }).nullable(),
});
export type AdminComplaint = z.infer<typeof adminComplaintSchema>;

const newComplaintBody = z.object({
  category: complaintCategorySchema,
  body: z.string().trim().min(5).max(4000),
  bookingId: uuidSchema.optional(),
});

const complaintParams = z.object({ complaintId: uuidSchema });
const messageBody = z.object({ body: z.string().trim().min(1).max(4000) });

// ---------------------------------------------------------------------------------------------
// Players (and venue staff, for the reports they raised)
// ---------------------------------------------------------------------------------------------

export const reportProblem = endpoint({
  method: 'POST',
  path: '/v1/me/complaints',
  summary: 'Report a problem to the platform (optionally about one of your bookings or a venue)',
  auth: 'user',
  body: newComplaintBody.extend({ venueId: uuidSchema.optional() }),
  response: complaintSchema,
});

export const listMyComplaints = endpoint({
  method: 'GET',
  path: '/v1/me/complaints',
  summary: 'Problems you reported (as a player or for your venue), newest first',
  auth: 'user',
  response: z.object({ items: z.array(complaintSchema) }),
});

export const replyToMyComplaint = endpoint({
  method: 'POST',
  path: '/v1/me/complaints/:complaintId/messages',
  summary: 'Add a message to a problem you reported',
  auth: 'user',
  params: complaintParams,
  body: messageBody,
  response: complaintSchema,
});

// ---------------------------------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------------------------------

export const reportVenueProblem = endpoint({
  method: 'POST',
  path: '/v1/manage/venues/:venueId/complaints',
  summary: 'Venue: report a problem to the platform (e.g. a player, a payment, the app)',
  auth: 'user',
  orgPermission: 'complaints.create',
  params: z.object({ venueId: uuidSchema }),
  body: newComplaintBody,
  response: complaintSchema,
});

// ---------------------------------------------------------------------------------------------
// Platform team queue
// ---------------------------------------------------------------------------------------------

export const adminListComplaints = endpoint({
  method: 'GET',
  path: '/v1/admin/complaints',
  summary: 'Complaints queue, filterable by status, assignee and venue',
  auth: 'admin',
  permission: 'complaints.read',
  query: pageQuerySchema.extend({
    status: complaintStatusSchema.optional(),
    /** `me` for complaints assigned to the caller, `none` for unassigned. */
    assignee: z.union([z.enum(['me', 'none']), uuidSchema]).optional(),
    venueId: uuidSchema.optional(),
    q: z.string().trim().max(100).optional(),
  }),
  response: page(adminComplaintSchema),
});

export const adminGetComplaint = endpoint({
  method: 'GET',
  path: '/v1/admin/complaints/:complaintId',
  summary: 'One complaint with the whole conversation, internal notes included',
  auth: 'admin',
  permission: 'complaints.read',
  params: complaintParams,
  response: adminComplaintSchema,
});

export const adminUpdateComplaint = endpoint({
  method: 'PATCH',
  path: '/v1/admin/complaints/:complaintId',
  summary: 'Change status or assign to a team member (audited)',
  auth: 'admin',
  permission: 'complaints.handle',
  params: complaintParams,
  body: z.object({
    status: complaintStatusSchema.optional(),
    assigneeId: uuidSchema.nullable().optional(),
  }),
  response: adminComplaintSchema,
});

export const adminReplyToComplaint = endpoint({
  method: 'POST',
  path: '/v1/admin/complaints/:complaintId/messages',
  summary: 'Reply to the reporter, or add an internal note',
  auth: 'admin',
  permission: 'complaints.handle',
  params: complaintParams,
  body: messageBody.extend({ internal: z.boolean().default(false) }),
  response: adminComplaintSchema,
});
