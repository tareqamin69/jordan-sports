# M6 — Roles (RBAC) and the owner control panel

Plan and permission matrix: `docs/rbac-plan.md` (decisions in §9).

## What shipped

- **Permissions** are defined once in `packages/contracts/src/permissions.ts`; every admin and
  `/v1/manage` endpoint declares its permission in its contract. The auth guard enforces them
  (venue routes resolve the organization from the path id; other tenants get 404) and the UIs only
  hide what a role cannot use. `authz-matrix.test.ts` checks every role against every protected
  endpoint, and fails if a new endpoint forgets to declare a permission.
- **Platform roles** owner / admin / support / finance (one owner, DB-enforced); **venue roles**
  owner / manager / staff.
- **Staff security**: one-time setup links (`owner-setup-link.js`, team invitations), Argon2id,
  TOTP, lockout, 4 h / 30 min sessions, re-authentication for dangerous actions, email alerts on
  owner sign-in and new devices, optional admin IP allowlist, automatic audit of every change.
- **Owner panel** (admin app): dashboard with charts and CSV export; venues (approve/reject,
  suspend/unsuspend, archive by typing the name, private rating & notes, performance, commission
  override); complaints queue; users (profile, reliability, suspend/ban); bookings (search,
  detail, cancel with reason); settings (commission, WhatsApp, flags, IP allowlist); admin team;
  audit log with filters and CSV. Navigation follows the role.
- **Venue side** (web): Today (check-in / no-show), Team (add by phone, roles), Reports, venue
  settings (archive), Report to platform; tabs follow the role.
- **Players**: report a problem (from a booking or the account page) and follow replies.

## Deliberately deferred

- SMS/WhatsApp notifications for complaint replies (in-app only).
- A complaints "assign to any team member" picker (assign to me / unassign only).
- Dark theme for the charts (the design system is light-only).

## Operations

- Owner setup: see the "Staff accounts" section of `docs/production.md`.
- IP allowlist recovery: `node dist/cli/admin.js clear-ip-allowlist` in the api container.
- New env vars: `SMTP_URL`, `EMAIL_FROM` (`.env.example`).

## QA pass on staging (20 items)

Fixed together with regression tests (`qa-fixes.test.ts`, `launch-cleanup.test.ts`, `qa.spec.ts`,
plus unit tests for `joinPlace`, `axisTicks`, `freeStarts` and Arabic plural forms).

- **Real bugs found by the new tests:** a venue edit (owner or admin) silently reset the venue's
  amenities to none (a Zod default under `.partial()`; `venueProfilePatchSchema` has no defaults
  now), and owners could not reorder photos (missing `UPDATE (sort_order)` grant, migration 0024).
- **Decisions:** the dashboard now opens on *Today* (the calendar is one tab away); new setting
  "owner edits send the venue back to review" (default off; migration 0022); hidden sports are
  hidden from players only (nothing deleted); Islamic holidays are estimates (migration 0023) to be
  confirmed by the owner; the launch cleanup archives (soft) and cancels upcoming demo bookings
  without sending messages.
- **Not reproducible here:** the "30/08 in both date fields" report. Dates are now built from date
  parts (some browsers format `en-CA` as DD/MM/YYYY, which matches no option), the selects always
  contain their current value, the price tester starts at today and the bookings tab defaults to
  today → +14 days.
