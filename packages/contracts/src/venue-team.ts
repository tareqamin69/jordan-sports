import { z } from 'zod';
import { okSchema, uuidSchema } from './common.js';
import { venueBookingSchema } from './bookings.js';
import { endpoint } from './endpoint.js';
import { displayNameSchema, membershipRoleSchema, phoneInputSchema } from './identity.js';
import { venueStatsSchema } from './venue-oversight.js';

// ---------------------------------------------------------------------------------------------
// The venue owner's team (docs/rbac-plan.md §3): invite by phone, change role, remove.
// ---------------------------------------------------------------------------------------------

export const venueTeamMemberSchema = z.object({
  memberId: uuidSchema,
  userId: uuidSchema,
  displayName: z.string().nullable(),
  phone: z.string().nullable(),
  role: membershipRoleSchema,
  isYou: z.boolean(),
});
export type VenueTeamMember = z.infer<typeof venueTeamMemberSchema>;

const teamResponse = z.object({ members: z.array(venueTeamMemberSchema) });
const venueParams = z.object({ venueId: uuidSchema });
const memberParams = z.object({ memberId: uuidSchema });

export const listVenueTeam = endpoint({
  method: 'GET',
  path: '/v1/manage/venues/:venueId/team',
  summary: "The venue organization's owners, managers and front-desk staff",
  auth: 'user',
  orgPermission: 'staff.manage',
  params: venueParams,
  response: teamResponse,
});

export const addVenueTeamMember = endpoint({
  method: 'POST',
  path: '/v1/manage/venues/:venueId/team',
  summary: 'Add someone by phone number with a role; they sign in with that number',
  auth: 'user',
  orgPermission: 'staff.manage',
  params: venueParams,
  body: z.object({
    phone: phoneInputSchema,
    displayName: displayNameSchema,
    role: membershipRoleSchema.default('staff'),
    /** Required to give someone the owner role (full control of the venue). */
    confirmOwner: z.boolean().optional(),
  }),
  response: teamResponse,
});

export const changeVenueTeamRole = endpoint({
  method: 'PUT',
  path: '/v1/manage/members/:memberId',
  summary: "Change a team member's role (never your own; the last owner stays)",
  auth: 'user',
  orgPermission: 'staff.manage',
  params: memberParams,
  body: z.object({ role: membershipRoleSchema, confirmOwner: z.boolean().optional() }),
  response: teamResponse,
});

export const removeVenueTeamMember = endpoint({
  method: 'DELETE',
  path: '/v1/manage/members/:memberId',
  summary: 'Remove someone from the venue team (never yourself; the last owner stays)',
  auth: 'user',
  orgPermission: 'staff.manage',
  params: memberParams,
  response: okSchema,
});

// ---------------------------------------------------------------------------------------------
// Front desk: arrivals
// ---------------------------------------------------------------------------------------------

const bookingParams = z.object({ bookingId: uuidSchema });

export const checkInBooking = endpoint({
  method: 'POST',
  path: '/v1/manage/bookings/:bookingId/check-in',
  summary: 'Mark that the customer arrived (from an hour before the start until the end)',
  auth: 'user',
  orgPermission: 'booking.checkin',
  params: bookingParams,
  response: venueBookingSchema,
});

export const markNoShow = endpoint({
  method: 'POST',
  path: '/v1/manage/bookings/:bookingId/no-show',
  summary: 'Mark that the customer did not come (after the start time)',
  auth: 'user',
  orgPermission: 'booking.checkin',
  params: bookingParams,
  response: venueBookingSchema,
});

// ---------------------------------------------------------------------------------------------
// Venue owner reports
// ---------------------------------------------------------------------------------------------

export const getVenueStats = endpoint({
  method: 'GET',
  path: '/v1/manage/venues/:venueId/stats',
  summary: 'Venue owner: bookings and booking value over the last N days',
  auth: 'user',
  orgPermission: 'reports.read',
  params: venueParams,
  query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }),
  response: venueStatsSchema,
});
