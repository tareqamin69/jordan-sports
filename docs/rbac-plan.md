# Roles, permissions and the Owner control panel

- **Status:** approved by the owner to build without a review round (2026-09-28); decisions taken
  during the build are listed in §9 for review.
- **Principle:** every permission is enforced on the server. The apps only hide what a role can't
  use. Permissions and role bundles are defined once, in `packages/contracts/src/permissions.ts`,
  and every protected endpoint declares the permission it needs; an automated test calls every
  protected endpoint with every role and fails if any role can do what the matrix forbids.

## 1. Who is who

| Side | Role | Who |
|---|---|---|
| Platform (admin panel, `admin.` subdomain, email + password + authenticator) | **Owner** | the business owner, exactly one account |
| | **Platform Admin** | runs daily operations |
| | **Support** | answers players and venues |
| | **Finance** | money and reports, read-only elsewhere |
| Venue (per organization, `/manage`) | **Venue Owner** | owns the venue business |
| | **Venue Manager** | runs the schedule and bookings |
| | **Front-desk Staff** | at the counter |
| Players | **Player** | signed-in phone account |
| | **Visitor** | not signed in |

- Platform accounts are separate from player/venue accounts: they sign in with email, password and
  a mandatory authenticator on the admin subdomain, with their own session cookie. A phone
  account can never reach the admin API, and an admin session can't use the player/venue API.
- One phone account can be a Player and hold venue roles in several organizations (the existing
  mode switch). Venue roles are per organization.
- The Owner account is created only from the server (a one-time setup link, §6). The panel can
  never create or promote another Owner.

## 2. Platform permissions matrix

✓ = allowed, 🔒 = allowed after re-authentication in the last 10 minutes, – = blocked (403).

| Permission | Action | Owner | Admin | Support | Finance |
|---|---|:-:|:-:|:-:|:-:|
| `reports.read` | dashboard: counts of bookings, cancellations, no-shows, new users/venues; top venues/areas | ✓ | ✓ | ✓ | ✓ |
| `revenue.read` | revenue and commission figures, finance reports, CSV exports | ✓ | ✓ | – | ✓ |
| `venues.read` | list/search venues, venue details, performance, bookings | ✓ | ✓ | ✓ | ✓ |
| `venues.review` | approve / reject (reason) / suspend / unsuspend | ✓ | ✓ | – | – |
| `venues.edit` | edit any venue: info, courts, photos; create a venue for an organization | ✓ | ✓ | – | – |
| `venues.archive` | archive a venue (soft delete, type its name to confirm) | 🔒 | – | – | – |
| `venues.rate` | private rating (1–5), tags and notes per venue, history | ✓ | – | – | – |
| `organizations.read` | list/see organizations and their members | ✓ | ✓ | ✓ | ✓ |
| `organizations.manage` | create an organization, add a member | ✓ | ✓ | – | – |
| `users.read` | search users, profile, booking history, reliability signals | ✓ | ✓ | ✓ | ✓ |
| `users.manage` | suspend / ban / reactivate a user | ✓ | ✓ | – | – |
| `bookings.read` | search/filter all bookings, details and history | ✓ | ✓ | ✓ | ✓ |
| `bookings.cancel` | cancel any booking with a reason | ✓ | ✓ | ✓ | – |
| `complaints.read` | the complaints queue and threads | ✓ | ✓ | ✓ | ✓ |
| `complaints.handle` | assign, reply, change status, close | ✓ | ✓ | ✓ | – |
| `finance.manage` | manual balance adjustments (CliQ balance, currently switched off) | 🔒 | – | – | – |
| `settings.read` | see platform settings | ✓ | ✓ | – | – |
| `settings.manage` | commission %, platform WhatsApp, feature flags, admin IP allowlist | 🔒 | – | – | – |
| `catalog.manage` | sports, governorates/areas, public holidays | ✓ | – | – | – |
| `team.read` | see the admin team | ✓ | – | – | – |
| `team.manage` | invite / change role / remove admin team members | 🔒 | – | – | – |
| `audit.read` | audit log viewer and CSV export | ✓ | ✓ | – | – |

Every signed-in staff member can see their own profile and re-authenticate.

## 3. Venue permissions matrix

A member of another organization gets **404** (the resource is not even confirmed to exist); a
member lacking the permission gets **403**.

| Permission | Action | Venue Owner | Manager | Staff |
|---|---|:-:|:-:|:-:|
| `venue.read` | venue dashboard, courts, schedule (without prices) | ✓ | ✓ | ✓ |
| `venue.edit` | venue info, photos, courts, registration/submit | ✓ | – | – |
| `venue.archive` | archive the venue (type its name to confirm) | ✓ | – | – |
| `schedule.hours` | weekly working hours | ✓ | ✓ | – |
| `schedule.rules` | booking rules (lengths, lead time, buffers, cancellation window) | ✓ | – | – |
| `schedule.closures` | closures and special dates | ✓ | ✓ | – |
| `schedule.block` | block time on the calendar, remove blocks | ✓ | ✓ | ✓ |
| `pricing.read` | see prices (booking prices are hidden from staff everywhere) | ✓ | ✓ | – |
| `pricing.manage` | change prices | ✓ | ✓ | – |
| `booking.read` | calendar, bookings list, today view | ✓ | ✓ | ✓ |
| `booking.create` | add a phone / walk-in booking | ✓ | ✓ | ✓ |
| `booking.cancel` | cancel a booking with a reason | ✓ | ✓ | – |
| `booking.checkin` | check-in / no-show | ✓ | ✓ | ✓ |
| `payments.manage` | confirm CliQ transfers, refunds (CliQ currently switched off) | ✓ | ✓ | – |
| `reports.read` | financial reports, commission balance | ✓ | – | – |
| `staff.manage` | invite by phone, change role, remove staff | ✓ | – | – |
| `complaints.create` | report a problem to the platform, see its status and replies | ✓ | ✓ | – |

Rules: an organization always keeps at least one Venue Owner; nobody can change their own role.

## 4. Players and visitors

| Action | Visitor | Player |
|---|:-:|:-:|
| browse venues, availability, prices | ✓ | ✓ |
| book, cancel own booking, my bookings | – | ✓ |
| report a problem (about a booking or venue), see its status and replies | – | ✓ |
| profile | – | ✓ |

A player only ever sees their own bookings and reports (others' → 404).

## 5. Enforcement design

- **Contracts:** `permissions.ts` defines `platformPermissions`, `orgPermissions` and the role
  bundles above; each endpoint declares `permission` (admin API) or `orgPermission` (venue API).
- **Admin API:** the global guard checks the admin session, the IP allowlist, the role's permission
  and, for 🔒 actions, a re-authentication within 10 minutes — all before the request body is read.
- **Venue API:** a guard resolves the organization from the path (`venueId`, `resourceId`,
  `bookingId`, `blockId`, `overrideId`, `ruleId`, `mediaId`, `paymentId`, `memberId`) in the
  database, never from the request body, and checks membership and permission before the handler.
  Services keep their own checks as a second line. Staff responses have prices removed on the
  server.
- **Navigation:** the admin panel builds its menu from the signed-in role's permissions; the venue
  dashboard shows tabs from the permissions returned with the schedule.
- **Tests:** `authz-matrix.test.ts` enumerates every protected endpoint from the contracts and calls
  it as every role (4 platform roles; venue owner/manager/staff; an owner of another organization;
  a player), asserting allowed → not 401/403/404, blocked → 403 (or 404 for other tenants). A new
  endpoint without a declared permission fails the test.

## 6. Security of platform accounts

- **Owner setup:** a server command creates a one-time link (valid 30 minutes, single use, stored
  only as a hash). The owner opens it, sets a password (Argon2id, 12+ characters, checked against
  common passwords) and enrols Google Authenticator by scanning a QR code and entering a code. No
  password ever appears in code, config, git or chat. Admin-team invites use the same mechanism
  (link valid 48 hours, shown once to the Owner).
- **Sessions:** admin sessions last at most 4 hours and end after 30 minutes idle.
- **Re-authentication:** 🔒 actions need password + authenticator code in the last 10 minutes.
- **Brute force:** rate limits per IP and per email (existing), plus account lockout for 15 minutes
  after 5 failed attempts; the account owner gets an email.
- **Alerts:** an email on every Owner sign-in, and on any staff sign-in from a new device (device
  cookie); recorded as security events too. Email goes through SMTP (`SMTP_URL`, any provider);
  until configured, alerts are logged and visible in the audit log.
- **IP allowlist (optional):** the Owner can restrict the admin panel to listed addresses/ranges; the
  server refuses a list that would lock out the current address; a server command clears it.
- **Audit:** append-only log (who, what, when, before/after, IP, device, request id) for every
  admin and venue-staff change: domain events with before/after values, plus one entry for every
  state-changing admin or venue request (including refused ones). Viewer with filters and CSV.

## 7. Owner panel

| Screen | Contents | Permission |
|---|---|---|
| Dashboard | bookings, revenue, cancellations, no-shows, new users/venues for today / 7 days / 30 days; daily chart; top venues and areas | `reports.read` (+ `revenue.read` for money) |
| Venues | review queue, all venues, approve/reject/suspend/unsuspend, edit, archive, performance and bookings, private rating | `venues.*` |
| Complaints | queue by status (جديد، قيد المتابعة، محلول), assignee, thread with replies to the reporter, internal notes | `complaints.*` |
| Users | search, profile, bookings, reliability (no-shows, late cancellations), suspend/ban | `users.*` |
| Bookings | search/filter all, details and history, cancel with reason | `bookings.*` |
| Settings | commission %, platform WhatsApp, feature flags, IP allowlist; links to sports/areas/holidays | `settings.*`, `catalog.manage` |
| Admin team | invite by email with role (link), change role, remove | `team.*` |
| Audit log | filters (actor, action, target, organization, dates), CSV export | `audit.read` |

## 8. Data model additions

- `identity.users.platform_role`: `super_admin` renamed `owner`, at most one owner (unique index);
  `status` gains `banned`; lockout counters; `identity.sessions.reauthenticated_at`;
  `identity.account_setup_tokens`; `identity.known_devices`.
- `platform.settings` (key/value, audited).
- `venue.venues.commission_bps` becomes an optional per-venue override of the platform default.
- `admin.venue_ratings` (Owner only, append-only history).
- `support.complaints`, `support.complaint_messages`.

## 9. Decisions taken during the build

Filled in as the work lands; see the end of this file.
