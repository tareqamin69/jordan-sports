# Jordan Sports — Product & Technical Architecture

> **Status:** Approved (2026-09-27). This document is the authoritative architecture for the project.
> Architectural decisions are recorded individually in [`docs/adr/`](./adr/README.md).
> "Jordan Sports" is a working name.
>
> This document describes the **target** architecture. What is actually implemented at any point is
> tracked per milestone in [`docs/milestones/`](./milestones/). Nothing described here should be assumed
> to exist in code unless a milestone document says it was built and tested.

---

## Contents

- [A. Executive understanding](#a-executive-understanding)
- [A.1 Issues identified in the specification](#a1-issues-identified-in-the-specification)
- [A.2 Approved product decisions](#a2-approved-product-decisions)
- [B. Architecture overview](#b-architecture-overview)
- [C. Technology stack](#c-technology-stack)
- [D. Monorepo structure](#d-monorepo-structure)
- [E. Domain architecture](#e-domain-architecture)
- [F. Database architecture](#f-database-architecture)
- [G. Booking concurrency strategy](#g-booking-concurrency-strategy)
- [H. Availability engine, time and pricing](#h-availability-engine-time-and-pricing)
- [I. Payments, money and ledger](#i-payments-money-and-ledger)
- [J. Split payments, open matches, reliability](#j-split-payments-open-matches-reliability)
- [K. Multi-tenancy](#k-multi-tenancy)
- [L. Authentication and authorization](#l-authentication-and-authorization)
- [M. Internationalization (Arabic / English)](#m-internationalization-arabic--english)
- [N. API architecture](#n-api-architecture)
- [O. Frontend architecture](#o-frontend-architecture)
- [P. Venue dashboard](#p-venue-dashboard)
- [Q. Admin platform](#q-admin-platform)
- [R. Testing strategy](#r-testing-strategy)
- [S. Security and privacy](#s-security-and-privacy)
- [T. Observability](#t-observability)
- [U. Local development](#u-local-development)
- [V. Docker strategy](#v-docker-strategy)
- [W. Deployment strategy](#w-deployment-strategy)
- [X. MVP scope](#x-mvp-scope)
- [Y. Explicitly deferred features](#y-explicitly-deferred-features)
- [Z. Development milestones](#z-development-milestones)
- [AA. Risks](#aa-risks)
- [AB. Architectural decisions](#ab-architectural-decisions)
- [AC. Open questions](#ac-open-questions)

---

## A. Executive understanding

- **Two products on one core.** A player marketplace (demand) and venue operating software (supply +
  operations). The venue side is not secondary: the marketplace is only as trustworthy as venue
  calendars, so venue software is what makes marketplace inventory real.
- **The core asset** is one authoritative, concurrency-safe calendar per bookable unit that every
  channel writes into (marketplace, phone, walk-in, future integrations).
- **Everything later reuses the core.** Open matches, split payments, teams, leagues, coaching and
  memberships all reduce to *people + a resource + a time range + money + rules*. If identity,
  tenancy, a sport-agnostic resource/time model, exact money with a ledger, and domain events are
  right, later layers are additive rather than rewrites.
- **Wedge:** Football, Padel and Tennis bookings in Amman; revenue from commission/service fees.
- **Non-negotiables:** no double booking (enforced in the database), exact and auditable money,
  Arabic/English first-class, tenant isolation, provider-agnostic payments/notifications/maps, and no
  fake functionality.

## A.1 Issues identified in the specification

1. **Booking states mix four independent dimensions.** `REFUND_PENDING/REFUNDED` are payment states,
   `CHECKED_IN/NO_SHOW` are attendance, `DISPUTED` is a parallel case, and `IN_PROGRESS` is derived
   from the clock. A single enum permits impossible combinations. Resolved in [G](#g-booking-concurrency-strategy)
   ([ADR-0005](./adr/0005-booking-state-model.md)).
2. **"Real-time availability" must be defined.** Availability reads are snapshots; only the hold
   transaction is authoritative. The UX must handle "slot just taken" gracefully. Live push is later.
3. **Calendar accuracy is the #1 operational risk.** The database prevents two *recorded* bookings from
   overlapping; it cannot know about a phone booking staff never entered. "Block" and "Add booking"
   must be the fastest actions in the dashboard and usable on a phone. *Open:* a venue-fault policy
   when a venue double-books offline (proposed: venue-fault cancellation, full refund, recorded
   against the venue).
4. **Combinable resources** (full pitch vs. two halves; a court shared by several sports) were missing.
   They are part of the core model from day one ([ADR-0004](./adr/0004-occupancy-exclusion-constraint.md)).
5. **Money custody is a legal question.** If the platform collects player money and pays venues, it
   holds funds for third parties, which may require a licensed provider's marketplace/split-settlement
   product or regulatory review (Central Bank of Jordan). This shapes ledger, payouts and refunds.
6. **Pay-at-venue** is allowed in the MVP as a fallback until a payment provider is chosen (see A.2).
   Commission collection for these bookings is an open money question.
7. **No cancellation/refund policy** was specified; it is required for "manage booking". Who absorbs
   payment fees on refunds is open.
8. **Taxes, receipts, invoices and commission** are undefined (tax-inclusive prices, service-fee tax,
   commission base, e-invoicing obligations).
9. **`PARTIALLY_PAID` per split participant**: a share is paid atomically unless instalments are
   intended. The "6 of 8 paid" rule is a business decision ([J](#j-split-payments-open-matches-reliability)).
10. **No-shows are venue-asserted** and need a contest path; MVP records raw signals only, no scores.
11. **Deletion vs. auditability**: deletion requests conflict with financial record retention. We
    pseudonymize retained records; legal must define retention periods.
12. **Reviews after completion** need attendance evidence; pay-at-venue without check-in is weak evidence.
13. **Monthly resource calendar** has limited operational value: day/week in MVP, month deferred
    (flagged, not silently removed).
14. **Missing requirements added:** accessibility (WCAG 2.2 AA), minimum age (now: 16), support contact
    flow, terms/privacy content, brand/domain, and venue-private customer data.
15. **Local calendar realities are configuration, not assumptions:** Friday–Saturday weekend, venues
    open past midnight (a 01:00 slot is "Thursday night"), Ramadan/seasonal hours, public holidays.
16. **Cross-venue search by price and availability** is expensive if naive; the MVP bounds it.
17. **Recurring bookings** were in the domain list but in no phase. Approved: venue-side recurring
    series in the MVP.
18. **`BookingItem`**: MVP books one resource per booking; the schema supports several items.

## A.2 Approved product decisions

Recorded on 2026-09-27 together with approval of this plan.

| Topic | Decision |
|---|---|
| Architectural decisions AB 1–16 | All approved ([ADR index](./adr/README.md)) |
| Default locale | Arabic (`ar`). English (`en`) available. No automatic Accept-Language redirect: `/` goes to `/ar`. |
| Digits | Western digits (0–9) in both locales |
| Price display | Arabic: `25.000 د.أ` — English: `JOD 25.000` (always three decimals) |
| Player sign-in | Phone OTP. SMS/WhatsApp provider TBD; built behind a `NotificationChannel`/OTP abstraction with a **development console channel** until a provider is chosen (never enabled in production) |
| Minimum age | 16 |
| Venue onboarding | Admin-created for the pilot; self-signup later |
| Combinable resources | Yes, in the core model |
| Recurring weekly bookings | Yes, venue-side, in the MVP |
| Player data visible to venues | Player name + phone, only for bookings at that venue |
| Slot crossing a price band | Priced by the band in which the slot **starts** |
| Hold timeout | 10 minutes |
| Pay-at-venue | Allowed in the MVP as a fallback until a payment provider is chosen |
| Money / commission / tax / provider questions | Deferred until before M6; not blocking earlier milestones |
| Local infrastructure | Docker daemon / PostGIS may be used for local development |

---

## B. Architecture overview

A **modular monolith**: one API codebase with strict internal module boundaries, deployed as two
processes (HTTP and worker), plus two Next.js frontends ([ADR-0001](./adr/0001-modular-monolith.md)).

```
 Browser / future mobile app (ar/en, RTL/LTR)
     │                                   │
 apps/web (Next.js)                  apps/admin (Next.js)
 marketplace (SSR/SEO)               separate origin, mandatory 2FA
 + /manage venue dashboard
     │ same-site /api proxy              │
     └──────────────┬────────────────────┘
                    ▼
      apps/api — NestJS, REST /v1, OpenAPI
      identity · tenancy · catalog · venues · resources · scheduling
      pricing · bookings · payments · finance · notifications · audit · search
                    │ transactional outbox + Postgres job queue
      worker process (same code): hold expiry, payment reconciliation,
                                  notifications, report aggregation
                    │
 PostgreSQL 16 (+PostGIS, btree_gist, pg_trgm, citext) ← single source of truth
 Redis (rate limiting, caches; never authoritative)
 S3-compatible object storage (venue media)
 Adapters: PaymentProvider · NotificationChannel · Maps/Geocoding
```

**Why a separate API rather than Next.js alone:** a future mobile app needs a stable versioned API;
webhooks, background jobs and payment reconciliation do not belong in a frontend framework; and
domain logic must stay out of UI code. The cost is one extra deployable.

## C. Technology stack

| Area | Choice | Why | Alternatives considered |
|---|---|---|---|
| Language | TypeScript (strict) everywhere | One language across API, web, admin and a future React Native app | — |
| Runtime | Node.js 22 LTS | Long-term support | Bun (less proven in production for this) |
| Monorepo | pnpm workspaces + Turborepo ([ADR-0012](./adr/0012-pnpm-turborepo.md)) | Strict dependencies, cached builds | Nx (heavier) |
| API | NestJS on the Fastify adapter ([ADR-0001](./adr/0001-modular-monolith.md)) | Module system maps to domain modules; guards; testing utilities | Plain Fastify with hand-built modules |
| Database | PostgreSQL 16 + PostGIS, btree_gist, pg_trgm, citext ([ADR-0003](./adr/0003-postgresql-extensions-and-schemas.md)) | Exclusion constraints, geospatial search, text search | — |
| DB access | Kysely + SQL-first migrations; types generated from the real schema ([ADR-0002](./adr/0002-kysely-sql-first-migrations.md)) | Integrity features are first-class in SQL | Drizzle; Prisma |
| Contracts | zod → OpenAPI → generated client ([ADR-0010](./adr/0010-rest-openapi-zod-contracts.md)) | One source of truth for web, admin and mobile | tRPC; GraphQL |
| Jobs | graphile-worker (queue in Postgres) + transactional outbox ([ADR-0007](./adr/0007-postgres-jobs-outbox-redis-cache.md)) | Jobs enqueued in the same transaction as state changes | BullMQ on Redis |
| Cache / rate limiting | Redis 7 | Rate limits across instances, short-lived caches | — |
| Auth | In-house module ([ADR-0017](./adr/0017-in-house-authentication.md), after the M1 spike of Better Auth in [ADR-0009](./adr/0009-authentication.md)) | Phone-first without fake emails; fits the SQL-first schema | Better Auth; hosted identity |
| Web | Next.js App Router, Tailwind CSS (logical properties), Radix-based components, TanStack Query, react-hook-form + zod, next-intl | SSR/ISR for SEO; RTL support | — |
| Time | Luxon (IANA zones) in the domain; `Intl` for formatting | Mature time-zone arithmetic | Temporal once native in Node |
| Testing | Vitest, fast-check, real Postgres, Playwright | — | — |
| Observability | pino, OpenTelemetry, Sentry (decision pending) | Standard, provider-neutral | — |
| CI | GitHub Actions | Repository is on GitHub | — |

## D. Monorepo structure

```
jordan-sports/
├─ apps/
│  ├─ web/          Next.js: marketplace + /manage (venue dashboard)
│  ├─ admin/        Next.js: platform admin (separate origin)
│  └─ api/          NestJS modular monolith
│     ├─ src/main.http.ts, src/main.worker.ts      (two entrypoints, one image)
│     ├─ src/modules/<module>/{domain,application,infrastructure,http}
│     ├─ src/platform/  db/tx/retry, tenant scope, outbox, idempotency, authz, logging, config
│     ├─ migrations/    SQL, forward-only
│     └─ test/          integration, concurrency, isolation, payments
├─ packages/
│  ├─ contracts/   zod schemas, OpenAPI generation, generated client
│  ├─ money/       exact Money, allocation, rounding, formatting (shared UI ↔ API)
│  ├─ i18n/        ar/en catalogs (ICU), locale config
│  ├─ ui/          RTL-safe design system, tokens, fonts
│  └─ config/      tsconfig / eslint / prettier presets
├─ infra/docker/   compose.yml, Dockerfiles
├─ tests/e2e/      Playwright end-to-end tests
├─ scripts/        repository checks (RTL, i18n parity, sport literals)
├─ docs/           architecture, ADRs, milestones, development guide
└─ .github/workflows/
```

Module boundaries are enforced by lint rules: a module may import only another module's public
`index.ts`, never its repositories or tables.

## E. Domain architecture

**Layers inside each module:** `domain` (pure: entities, value objects, state machines, policies — no
I/O) → `application` (use cases, transaction boundaries, authorization checks) → `infrastructure`
(SQL repositories, provider adapters) → `http` (controllers, request/response mapping).

| Module | Owns |
|---|---|
| identity | users, credentials, sessions, OTP challenges, consents |
| tenancy | organizations, memberships, roles → permissions, staff invitations |
| catalog | sports, sport formats (variants), resource types + attribute schemas, amenities, level scales, cities/areas, holiday calendars |
| venues | venue, facility (grouping), location, media, contact, approval status |
| resources | bookable resources, **resource units**, unit mapping, supported sport formats, booking policies |
| scheduling | schedules, exceptions, blocked time, **occupancy**, availability queries |
| pricing | price rules (versioned), quotes (pure calculation), snapshots |
| bookings | bookings, items, participants, status history, cancellation policies, check-in, venue customers, recurring series |
| payments | payment intents, attempts, provider events inbox, refunds, `PaymentProvider` adapters |
| finance | double-entry ledger, commission rules, payout statements, payouts |
| notifications | preferences, deliveries, localized templates, `NotificationChannel` adapters |
| audit | append-only audit log |
| search | read-only queries across venues, resources and availability |
| *(future)* | matches, invitations, reviews, promotions, reliability, teams, competitions, coaching, memberships |

**Communication between modules:**
- Synchronous calls through public interfaces when two changes must commit atomically (e.g.
  `bookings` asks `scheduling` to acquire occupancy inside the booking transaction).
- Domain events through the transactional outbox for side effects (notifications, search updates,
  reports).
- Ledger postings are **not** events: they are written in the same transaction as the payment state
  change they record.

**Sport-agnostic core:**
- `Sport` → `SportFormat` (e.g. "football 5v5", "padel doubles") with min/max players, default
  durations and a level scale.
- `ResourceType` (e.g. "padel court", "football pitch") with an attribute schema (surface,
  indoor/outdoor, lighting, size), validated by the application (PostgreSQL has no built-in JSON
  Schema validation).
- A compatibility table links resource types to sport formats; each resource is linked to the formats
  it supports.
- Football, Padel and Tennis exist **only as seed data and translations**. A CI check
  (`scripts/check-sport-literals.mjs`) rejects sport-name literals in API source code.

## F. Database architecture

**Conventions**
- **IDs:** UUIDv7 primary keys generated by the application (Postgres 16 has no native generator);
  bookings also get a short human-friendly reference code.
- **Instants:** `timestamptz` (UTC). **Ranges:** `tstzrange` with `[)` bounds.
- **Local times:** `date`/`time` only for venue-local recurring rules, always next to an explicit IANA zone.
- **Money:** `bigint` minor units (fils; 1 JOD = 1000 fils) + `char(3)` currency. No floats anywhere.
- **Translated content:** `jsonb` `{"ar": "…", "en": "…"}` with a check that at least one language exists.
- **Status fields:** `text` + `CHECK` (easier to migrate than Postgres enums).
- **Structure:** one Postgres schema per module (`booking.*`, `payment.*`, …); cross-module foreign keys
  are allowed because integrity outranks service purity at this stage.
- **Deletion:** venues/resources are archived, never deleted; bookings, payments, ledger and audit rows
  are never deleted; users are anonymized.
- **Concurrent edits:** editable aggregates (venue, schedule, price rules) carry a `version` column.
- **Database roles:** the login role runs migrations; the API connects with the same login but
  switches to the non-login role `js_app` via the connection startup parameter `role` (the
  connection fails if the role cannot be assumed). `js_app` has only explicitly granted DML (no DDL,
  no UPDATE/DELETE on append-only tables) and is subject to row-level security. A `readonly`
  analytics role comes later.

**Core tables (MVP)**
- **identity:** `users` (E.164 phone with partial unique index, `email citext`, locale, status, birth
  year or age attestation for the 16+ rule), `sessions`, `otp_challenges`, `consents`.
- **tenancy:** `organizations`; `memberships` (user, organization, role, optional venue scope; unique per user+org).
- **catalog:** `sports`, `sport_formats`, `resource_types`, `resource_type_formats`, `amenities`,
  `cities`, `areas`, `holiday_calendars`/`holidays`.
- **venues:** `venues` (organization, unique slug, localized name/description, status, IANA `timezone`,
  `currency`, `location geography(Point)`, localized address, area, `business_day_starts_at`),
  `facilities`, `venue_media`, `venue_amenities`.
- **resources:** `resources` (venue, facility, type, attributes, status, booking policy);
  `resource_units`; `resource_unit_map` (full pitch → units A+B, half pitch → A); `resource_formats`;
  `booking_policies` (allowed durations, start alignment, lead time, max advance, buffers, hold length
  — default 10 min, cancellation policy).
- **scheduling:** `schedules` + `schedule_windows` (day of week, local start, duration; may cross
  midnight); `schedule_exceptions`; `blocked_times` (maintenance, closure, private event, other;
  optional series); **`occupancies`** (unit, range, kind = hold/booking/block, `active`, `expires_at`,
  booking or block reference).
- **bookings:** `bookings` (reference, venue, organization, player or venue customer, channel =
  MARKETPLACE/VENUE_MANUAL, status, range, time-zone snapshot, currency, subtotal, discount, fees, tax,
  total, venue net, pricing snapshot, policy snapshot, hold expiry, check-in and cancellation fields);
  `booking_items`; `booking_participants`; `booking_status_history` (append-only);
  `venue_customers` (tenant-private); `booking_series`.
- **payments:** `payment_intents` (unique provider+provider ref; unique idempotency key),
  `payment_attempts`, `provider_events` (unique provider+event id; raw payload), `refunds`.
- **finance:** `ledger_accounts`, `journal_entries`, `postings` (trigger enforces balanced entries),
  `commission_rules` (basis points, effective dates), `payout_statements`, `payouts`.
- **platform:** `schema_migrations`, `outbox_events`, `idempotency_keys`, `audit_logs`,
  `notification_deliveries`.

**Integrity constraints**
- Occupancy exclusion constraint — the anti-double-booking guarantee:
  `EXCLUDE USING gist (unit_id WITH =, during WITH &&) WHERE (active)`.
- Refunds never exceed the captured amount (payment row locked `FOR UPDATE`, sum checked in the same
  transaction).
- Ledger journal entries always balance to zero.
- Bookings: total equals the sum of components; range start < end.

**Indexes:** GiST on `occupancies (unit_id, during)`; partial index on active holds by `expires_at`;
GiST on `venues.location`; trigram indexes on normalized Arabic/English names;
`bookings (venue_id, lower(during))`, `bookings (customer_user_id, lower(during))`;
`payment_intents (status, created_at)`.

**Migrations:** plain SQL, forward-only, reviewed; applied migrations are never edited (the runner
verifies checksums). Expand/contract for zero-downtime deploys. CI applies all migrations to a fresh
database. Reference data (sports, formats, resource types, cities) ships as migrations; demo venues are
a dev-only seed.

## G. Booking concurrency strategy

**State model** ([ADR-0005](./adr/0005-booking-state-model.md))
- `booking.status`: `HELD` (slot reserved, `hold_expires_at` set) → `CONFIRMED` | `EXPIRED` | `CANCELLED`;
  `CONFIRMED` → `COMPLETED` | `NO_SHOW` | `CANCELLED`. Every transition is a guarded compare-and-set
  (`UPDATE … WHERE status = $expected`) and is written to history.
- `payment_status` (kept up to date from payment records): `NOT_REQUIRED`, `UNPAID`, `PAID`,
  `PARTIALLY_REFUNDED`, `REFUNDED` (`PARTIALLY_PAID` arrives with split payments). Pay-at-venue
  bookings are `UNPAID` with payment method `PAY_AT_VENUE` until the venue records collection (exact
  rules finalized in M5).
- Attendance: `checked_in_at` / `checked_in_by`. `NO_SHOW` is terminal, set by the venue within a
  window, reversible by admins.
- Dispute: a separate entity linked to the booking; never changes the booking status.
- "In progress" is derived from the clock; "draft" exists only on the client.

**Hold transaction** (READ COMMITTED; the exclusion constraint serializes):
1. Look up the `Idempotency-Key`; if already used with the same request, return the stored response.
2. Validate: venue approved, resource active, slot within schedule and policy, lead time, the user's
   active-hold limit.
3. Compute and snapshot the price quote.
4. Release **expired** holds overlapping this range
   (`UPDATE occupancies SET active=false WHERE … kind='hold' AND expires_at < now()`), marking their
   bookings `EXPIRED`.
5. Insert the booking (`HELD`, expires in 10 minutes) and one occupancy row per unit (buffers included).
6. Commit. Exclusion violation (`23P01`) → `409 SLOT_UNAVAILABLE`, not retried. Serialization
   failures/deadlocks (`40001`/`40P01`) → up to 3 retries with jitter.

Two simultaneous holds collide in the index; exactly one commits. No advisory or Redis locks needed.

**Payment and confirmation**
- The payment intent is stored (`INITIATED`) **before** calling the provider; the provider call happens
  **outside** any database transaction; the provider reference is stored afterwards.
- Hold expiry must outlast the payment session (hold expiry ≥ provider session expiry + grace). With a
  10-minute hold, the extension rule applied when payment starts (and its cap) is finalized in M6 once
  provider session TTLs are known.
- Confirmation (webhook or return redirect, whichever first): store the raw event (duplicates rejected
  by unique event id) → lock the booking `FOR UPDATE` → `HELD` → `CONFIRMED` + ledger postings +
  outbox event in one transaction.
- **Late success after expiry:** try to re-insert occupancy; if it succeeds, confirm; otherwise refund
  automatically and notify. Logged and measured.
- **Lost webhooks:** a worker job polls the provider for intents stuck beyond a threshold.

| Race | Outcome |
|---|---|
| Two players hold the same slot simultaneously | One succeeds; the other gets 409 and next free slots |
| Double-click / network retry | Same idempotency key → same response |
| Duplicate webhook, or webhook before redirect | Duplicate rejected; guarded transition makes the second a no-op |
| Venue blocks time over an active hold | Rejected; dashboard shows "pending online booking, expires in N min" |
| Venue blocks time over a confirmed booking | Rejected; venue must first cancel the booking (which refunds it) |
| Schedule edited after bookings exist | Bookings stay; conflicts listed for the manager |
| Cancel and check-in simultaneously | Row lock + guarded transition: only one wins |
| Refund requested twice | Idempotency key + sum-of-refunds check |

**Other safeguards:** transactional outbox for every side effect; cap on active holds per user; rate
limits; verified phone required before holding a slot.

## H. Availability engine, time and pricing

**Inputs:** schedules, exceptions and holidays, active occupancies (bookings, unexpired holds,
external/manual bookings, blocks), booking policy (durations, start alignment, lead time, advance
window, buffers).

**Algorithm (per resource and date range):**
1. Expand local schedule windows into UTC ranges.
2. Subtract closures and exceptions.
3. Subtract occupied ranges on **any** of the resource's units (one indexed range query).
4. Generate aligned start times for each allowed duration.
5. Filter by lead time and advance window.
6. Price each slot.

The slot-generation core is a pure function, property-tested.

**Time rules**
- Instants stored in UTC; each venue has an IANA zone (`Asia/Amman`); recurring rules stored as local
  wall-clock times.
- IANA tzdata only, never hard-coded offsets. (Our understanding is that Jordan moved to permanent
  UTC+3 in 2022; the design is still tested against a DST zone: non-existent local times are skipped,
  ambiguous ones resolve to the earlier offset.)
- A **business day** starts at a configurable hour, so a 01:00 slot belongs to the previous day's
  calendar and pricing.
- The API returns both the UTC instant and venue-local fields; clients never convert venue times
  through the device time zone.
- No "weekend" constant: explicit day-of-week sets (Jordan's weekend is Friday–Saturday). Ramadan and
  seasonal hours are dated schedule overrides.

**Pricing**
- Bands: day-of-week set × local time range × effective dates, with priority; each band holds a price
  per allowed duration. Special periods override bands.
- Quote: a pure function (rules, slot) → itemized lines. Rules are versioned; each booking stores its
  snapshot and rule version.
- **A slot crossing a band boundary is priced by its start band** ([ADR-0014](./adr/0014-price-by-start-band.md)).

**Real time and performance:** availability is fetched fresh (at most seconds of cache); the hold
transaction is authoritative. At Amman scale computing on request from Postgres is fast; a free-slot
summary table updated from occupancy events is the later optimization.

**Search:** filter venues in Postgres by sport format, city/area, distance (PostGIS `ST_DWithin`),
amenities (rating later), then compute availability only for a bounded page of candidates. Arabic text
search on normalized text (alef variants, ta marbuta/ha, alef maqsura, diacritics, tatweel) with
trigram matching. No dedicated search engine.

## I. Payments, money and ledger

**Money rules** ([ADR-0006](./adr/0006-money-and-ledger.md))
- Integers in fils; rates in basis points.
- Each percentage rounded exactly once (half-up, to the fils); derived amounts by subtraction (venue
  net = total − commission − fees) so nothing drifts.
- Allocation (splits, partial refunds) by the largest-remainder method with deterministic tie-break;
  parts always sum to the total.
- Display formatting never changes stored values. Approved display: Arabic `25.000 د.أ`, English
  `JOD 25.000`, Western digits.
- One currency per venue; currencies never mix within a booking.

**`PaymentProvider` interface** (capability-driven)
- `createSession({intentId, amount, currency, idempotencyKey, returnUrl, expiresAt, customer, locale})`
  → `{providerRef, redirectUrl | clientToken, expiresAt}`
- `getStatus(providerRef)`; `capture` / `void` where supported;
  `refund({providerRef, amount, idempotencyKey, reason})`;
  `parseWebhook(headers, rawBody)` → verified, normalized events;
  `capabilities` (refunds, partial refunds, authorize/capture, tokenization, webhooks, methods).

**Lifecycles:** payment `INITIATED → PENDING → AUTHORIZED? → SUCCEEDED | FAILED | EXPIRED`;
refund `REQUESTED → PENDING → SUCCEEDED | FAILED` (failed refunds go to an admin queue).

**Provider selection (deferred until before M6):** unverified candidates include regional card
gateways operating in Jordan, bank-acquirer gateways, CliQ (JoPACC instant payments), eFAWATEERcom and
mobile wallets. Our understanding is that Stripe does not onboard Jordan-based merchants — to verify.
Until a provider is chosen, the MVP supports **pay-at-venue**.

**Test provider** ([ADR-0013](./adr/0013-test-payment-provider.md)): a real `TestPaymentProvider` for
automated tests and local development; the application refuses to start in production if it is enabled.

**Card data:** never stored; only redirect or hosted-field flows.

**Double-entry ledger from the MVP.** Example: 20.000 JOD booking, 10% commission, 1.000 JOD service fee:
- Player pays 21.000: debit Provider clearing 21.000; credit Venue payable 18.000, Commission revenue
  2.000, Service-fee revenue 1.000.
- Provider fees posted on settlement; refunds reverse postings per the policy snapshot; payouts debit
  Venue payable and credit Bank.

(Commission model and rates are open questions; the figures above are illustrative only.)

**Payouts in the MVP** ([ADR-0015](./adr/0015-manual-payouts.md)): payout statements generated from
the ledger; an admin makes the bank transfer outside the system and records it with a reference. No
automated payout integration is claimed.

## J. Split payments, open matches, reliability

*(Roadmap Phase 2; designed now so the MVP schema does not block it.)*

**Split model:** booking `payment_plan` FULL | SPLIT; per-participant shares with required amount,
amount paid, status, deadline and payment intent. Shares allocated by largest remainder; the organizer
absorbs the remainder by default (10 JOD / 3 = 3.334 / 3.333 / 3.333).

**Share statuses:** `INVITED → PENDING → PAID | DECLINED | EXPIRED`, then `REFUNDED`. `PARTIALLY_PAID`
per share is dropped unless instalments are wanted.

**When only some participants pay — options (business decision, before Phase 2):**
- **A. Organizer guarantees (recommended):** organizer pays their share when opening the split; at
  the deadline (capped at start − X hours) the organizer must cover the remainder, otherwise the
  booking expires and all paid shares are refunded.
- **B. Authorize-then-capture:** authorize each share, capture only when fully funded, otherwise void
  (no refund fees). Depends on provider support and authorization validity windows.
- **C. Remainder at venue:** booking confirms with partial online payment, subject to venue policy.

In all options: the booking becomes `CONFIRMED` only when fully funded; a paying participant who leaves
is refunded per policy after a replacement pays; organizer cancellation refunds everyone per policy;
failed payments leave the share `PENDING` and retryable; refunds go to each payer's original method;
**no stored-value wallet** (potential e-money regulation — legal review).

**Open matches:** a `Match` anchored to a booking: sport format (→ capacity), level range (sport's
level scale), visibility (public / link-only / private), join rules, participants. No matchmaking engine.

**Reliability:** from the MVP, raw auditable events are recorded (cancelled, late-cancelled,
completed, no-show, no-show contested). No score is shown until an explicit rule is approved.

## K. Multi-tenancy

([ADR-0008](./adr/0008-tenancy-and-row-level-security.md))
- The **organization** is the tenant and owns one or more venues (e.g. a chain with several branches).
- **Memberships** link a user to an organization with a role, optionally scoped to specific venues. A
  player and a staff member are the same `User`; staff capability comes only from memberships.
- **Data classification:** public (venue profile, resources, prices, availability); tenant-private
  (venue customers, manual booking details, revenue, payouts, staff); user-private (a player's bookings
  and payments); platform-private.
- **Enforcement, two layers:**
  1. Application layer (primary): tenant context derived server-side from session + memberships,
     never from client input; every tenant query goes through a helper that requires
     `organization_id`; a central policy check in each use case.
  2. Postgres row-level security on tenant-private tables (defense in depth): the helper sets
     `SET LOCAL app.org_id` inside the transaction; worker and admin use explicit, audited bypass roles.
- **Isolation test suite:** every venue-scoped endpoint is called by a user from another tenant and
  must return 404.
- **Player data visible to venues (approved):** player name and phone, only for bookings at that venue.

## L. Authentication and authorization

([ADR-0009](./adr/0009-authentication.md), implemented in-house per [ADR-0017](./adr/0017-in-house-authentication.md))
- **Players:** phone OTP (E.164, +962 default). SMS/WhatsApp provider TBD, built behind an OTP
  delivery abstraction; a **development console channel** logs codes locally and is refused in
  production. Optional email for receipts later. Minimum age **16**, captured at sign-up as an
  explicit self-attestation (no date of birth is stored — data minimization).
- **Venue staff:** phone or email sign-in; TOTP 2FA strongly recommended for owners/managers.
- **Admins:** email + password (Argon2id) + **mandatory** TOTP, on the separate admin origin, short
  sessions.
- **Sessions:** opaque, server-side (Postgres), revocable. Cookies `HttpOnly; Secure; SameSite=Lax`.
  The web app calls the API through a same-site `/api` proxy. Bearer tokens for mobile later. CSRF:
  SameSite + Origin check + CSRF token on mutating requests.
- **OTP safeguards:** rate limits per phone and IP, attempt caps, short expiry, responses that do not
  reveal whether an account exists.
- **Authorization:** fine-grained permission strings (`booking.read`, `booking.create_manual`,
  `booking.cancel`, `schedule.manage`, `pricing.manage`, `finance.read`, `staff.manage`, …). Roles
  bundle permissions and are defined in code for the MVP: Venue Owner / Venue Manager / Venue Staff;
  platform Super Admin / Admin / Support / Finance. One `authorize(actor, action, resource)` check that
  loads the owning organization from the database.

## M. Internationalization (Arabic / English)

([ADR-0011](./adr/0011-locale-urls-and-translated-content.md))
- next-intl with locale-prefixed URLs (`/ar/…`, `/en/…`), `hreflang`, and a sitemap per locale.
  **Default locale: Arabic.** `/` redirects to `/ar`; there is no automatic Accept-Language redirect.
- `<html lang dir>` set per locale.
- Tailwind **logical** properties only (`ms-`, `pe-`, `start-`, `end-`); a repository check rejects
  physical left/right utilities. Direction-sensitive icons are mirrored; Radix `DirectionProvider`.
- ICU MessageFormat. Arabic has six plural categories; plural messages are tested.
- No hard-coded user-facing strings (`react/jsx-no-literals` lint rule + catalog key-parity check in CI).
- Formatting through `Intl` with an explicit numbering system: **Western digits** (`ar-u-nu-latn`).
  Prices: `25.000 د.أ` (ar), `JOD 25.000` (en). Gregorian calendar.
- Mixed-direction text wrapped with `<bdi>` / Unicode isolates; phone numbers always LTR.
- Typography: IBM Plex Sans Arabic + IBM Plex Sans (self-hosted via Fontsource).
- Content: translated `jsonb` fields with fallback; email/SMS templates per locale; per-user locale.
- Server errors return machine-readable codes; clients translate them.
- Adding a language = a catalog + a locale config entry.

## N. API architecture

([ADR-0010](./adr/0010-rest-openapi-zod-contracts.md))
- REST at `/v1`; OpenAPI generated from zod contracts; generated TypeScript client.
- Errors: RFC 9457 problem details with a stable `code` (`SLOT_UNAVAILABLE`, `HOLD_EXPIRED`, …).
- Cursor pagination. `Idempotency-Key` required on booking, payment, refund and cancellation requests.
- Money: `{ "amount": 21000, "currency": "JOD" }` (integer minor units).
- Times: ISO 8601 UTC plus a `local` block and `timeZone`.
- Areas: public (`/v1/catalog/*`, `/v1/venues`, `/v1/venues/{slug}`,
  `/v1/resources/{id}/availability`, `/v1/search`); player (`/v1/me`, `/v1/bookings`,
  `/v1/bookings/{id}/pay`, `/v1/bookings/{id}/cancel`); venue (`/v1/orgs/{orgId}/venues/{venueId}/…`);
  admin (`/v1/admin/*`, admin origin only); webhooks (`/v1/webhooks/{provider}`, verified on raw body).
- Operational endpoints (unversioned): `/healthz` (liveness), `/readyz` (database + migrations).
- Rate limits keyed by IP, user and phone (Redis).

## O. Frontend architecture

| Page type | Rendering |
|---|---|
| Home, sport/city/area pages, venue pages | Server-rendered with incremental regeneration on venue change; JSON-LD (`SportsActivityLocation`); OG images per locale |
| Availability, checkout, account | Dynamic, client-fetched (TanStack Query), `noindex` |
| Venue dashboard (`/manage/…`) | Authenticated, client-heavy, `noindex` |

- Mobile-first and highly visual; discovery ordered sport → location → date → time; slot lists show
  prices; checkout fully bilingual.
- Maps behind `MapProvider` / `Geocoder` adapters, lazy-loaded; provider undecided; no domain dependency.
- Sharing: venue pages are public URLs; WhatsApp via `wa.me/?text=` links (no API). Invitation/match
  links later use random, revocable tokens (≥128 bits) showing minimal details, never payer data.
- Accessibility: WCAG 2.2 AA; Playwright + axe checks in both directions.
- Design system in `packages/ui`, reviewed visually in Arabic and English.

## P. Venue dashboard

- **Today:** timeline per resource, check-in, pending actions (unpaid, starting soon, no-show window).
- **Calendar:** day (resource × time) and week views. Tapping empty time offers **Block** or **Add
  booking**; conflicts come straight from the database constraint. Custom-built grid
  ([ADR-0016](./adr/0016-custom-resource-calendar.md)).
- **Setup:** bilingual venue profile, photos, location pin, facilities, resources and units (split /
  combine), schedules, exceptions, holidays, booking policy, cancellation policy (templates), price
  bands with a price preview ("Friday 21:00, 90 min = ?").
- **Bookings:** list/filters, manual bookings with a venue customer record, **recurring weekly series**,
  cancel with policy preview.
- **Reports (basic):** bookings, cancellations, occupancy, revenue — platform-collected revenue kept
  separate from venue-recorded revenue.
- **Staff:** invite, assign role, remove. All sensitive actions audited.

## Q. Admin platform

- Separate Next.js app and origin; mandatory 2FA.
- Venue approval (`DRAFT → SUBMITTED → APPROVED | REJECTED`, plus `SUSPENDED`); for the pilot, admins
  **create** organizations and venues directly.
- Users (search, suspend); catalog (sports, formats, resource types, amenities, cities/areas, holidays);
  booking and payment inspection with provider event timeline; manual refunds with reason; commission
  rules; payout statements and payout recording; audit log viewer.
- No impersonation in the MVP. Every admin change requires a reason and is audited.

## R. Testing strategy

| Layer | Tools | Focus |
|---|---|---|
| Unit / property | Vitest, fast-check | money and allocation, pricing, slot generation, state machines, time-zone expansion |
| Integration (real Postgres) | Vitest + migrated test database | repositories, constraints, row-level security, outbox, migrations |
| Concurrency | parallel real connections | 50 simultaneous holds → exactly 1 succeeds; full vs half pitch; block vs hold |
| Payments | `TestPaymentProvider` + recorded webhook fixtures | duplicate / out-of-order / missing webhooks; late success; failed and partial refunds |
| API / contract | Nest testing + generated client | authorization matrix, tenant isolation suite, problem-detail codes |
| End-to-end | Playwright | booking loop in Arabic and English, RTL layout, accessibility |

Every critical scenario in spec §31 gets a named test. CI runs lint, typecheck, unit, integration,
concurrency and e2e tests on every push and PR.

## S. Security and privacy

- Input: zod validation at every boundary; Kysely parameterized queries only; React escaping, no raw
  HTML (plain text or sanitized Markdown for descriptions); strict CSP and security headers.
- Uploads: type checked by content, size cap, EXIF (incl. GPS) stripped, direct-to-storage pre-signed URLs.
- Secrets: environment variables / secret manager only; nothing secret in `NEXT_PUBLIC_*`; secret
  scanning and dependency updates in CI.
- Webhooks: signature verification, timestamp tolerance, deduplication.
- Audit log: append-only (app role cannot update/delete); actor, action, target, organization,
  redacted diff, IP, user agent.
- Abuse: hold caps, OTP limits, rate limits, repeated-account signals.
- **Privacy** (our understanding: Jordan's Personal Data Protection Law No. 24 of 2023 — confirm with
  counsel): data minimization, recorded consent, self-service export and deletion (pseudonymizing
  records retained for financial reasons), defined retention periods, phone numbers never public.
- **Legal review items:** cross-border transfers and hosting region, fund custody for venues, WhatsApp
  messaging consent, minors (minimum age 16), tax and e-invoicing, terms of service and privacy policy.

## T. Observability

- pino structured logs with redaction (phone, email, tokens, cookies, provider payloads); request IDs
  propagated into jobs.
- OpenTelemetry traces across HTTP, database and jobs; error tracking (Sentry or equivalent, pending).
- Health: `/healthz` (liveness), `/readyz` (database reachable, no pending migrations).
- Metrics: hold → confirm conversion, `SLOT_UNAVAILABLE` rate, late-payment auto-refunds, webhook lag
  and stuck intents, job queue depth, availability p95.
- Alerts: stuck payments, failed refunds, outbox backlog.

## U. Local development

- Docker Compose runs infrastructure only (`infra/docker/compose.yml`): `postgis/postgis:16-3.4`,
  Redis 7, Mailpit (email catcher), MinIO (S3-compatible).
- Applications run on the host with `pnpm dev`.
- `.env.example` is committed; `.env` is git-ignored.
- Seeds: reference catalog and clearly labelled dev-only demo venues (from M2).
- See [`docs/development.md`](./development.md).

## V. Docker strategy

- Multi-stage Dockerfiles, non-root users: `api` image (HTTP and worker via different commands),
  `web` and `admin` images (Next.js standalone output). *(Introduced before the first deployment.)*
- Images built once in CI and promoted staging → production; no secrets in images.
- Migrations run as a separate release step with the `migrator` role.
- Compose is for local development only.

## W. Deployment strategy

*(Hosting provider, region and budget are open questions.)*
- Environments: local, CI, staging, production.
- Recommendation: containers on one cloud, managed Postgres with PostGIS and point-in-time recovery,
  managed Redis, object storage + CDN; region chosen for latency to Jordan **and** data-residency advice.
- CI/CD (GitHub Actions): checks → build images → migrate → deploy staging → smoke tests → manual
  promotion to production.
- Backups plus a tested restore drill before launch.

## X. MVP scope

**Player:** phone-OTP sign-in (16+); basic profile (name, phone, locale); discovery by sport format,
city/area, date/time, distance (with permission; otherwise area); list view (map if provider approved);
SEO-friendly venue pages; availability per resource with prices; hold (10 min) → payment → confirmation
(pay-at-venue until a provider is chosen); my bookings; cancellation with refund-policy preview;
WhatsApp venue sharing.

**Venue:** admin-created organization and venue for the pilot; bilingual venue profile, photos,
location; facilities, resources and units (split/combined pitches); schedules, exceptions, holidays,
blocked time; booking and cancellation policy; price bands with preview; day and week calendar;
manual/external bookings and blocks; **recurring weekly series**; check-in and no-show; bookings list;
basic reports; staff and roles.

**Admin:** organization/venue creation and approval; users; catalog; booking and payment inspection;
manual refunds; commission rules; payout statements and manual payout recording; audit log.

**Platform:** one real payment provider (after selection) behind the interface; ledger; outbox; audit;
notifications (email + one SMS/WhatsApp provider once chosen); Arabic/English with RTL; rate limiting;
observability; data export and deletion.

## Y. Explicitly deferred features

| Deferred | Hook already in the MVP design |
|---|---|
| Split payments, open matches, invitations | `payment_plan`, `booking_participants`, allocation in `packages/money`, token-link design |
| Rich player profiles, reliability indicators | Raw reliability events recorded from day one |
| Reviews | Completed / checked-in bookings determine eligibility |
| Waitlists | Occupancy release events in the outbox |
| Promotions, coupons, discounts | Discount line in the price snapshot; ledger accounts |
| Push and WhatsApp notifications, richer notifications | `NotificationChannel` adapter |
| Monthly calendar view | Same calendar query API |
| Automated payouts; disputes workflow (MVP: admin notes + manual refund); chargeback automation | Ledger, payout statements |
| Capacity-based resources (lanes, classes) | `booking_mode` on resource policy (MVP: exclusive only) |
| Multi-item bookings (equipment rental) | `booking_items` |
| External calendar sync | Channel field, blocked times |
| Venue self-signup | Venue approval workflow already modeled |
| Teams, leagues, tournaments, coaching, academies, memberships, loyalty, subscriptions, sponsored listings, corporate sports, equipment marketplace, AI, recommendations, matchmaking, multi-country | Sport-agnostic catalog; per-venue `timezone`/`currency`; outbox events as a data stream |
| Native mobile app | Versioned REST, OpenAPI client, bearer tokens |

## Z. Development milestones

Milestones are named M0–M9 to avoid confusion with the product roadmap phases. Each ends with its tests
passing in CI and a milestone document in `docs/milestones/`.

| # | Milestone | Done when |
|---|---|---|
| M0 | Foundations: monorepo, tooling, CI, compose, migration runner, i18n + RTL skeleton, design tokens, ADRs | CI green; empty web and admin render in Arabic and English with correct direction; `/healthz`; architecture docs |
| M1 | Identity & tenancy: auth spike and implementation, sessions, organizations, memberships, permissions, admin bootstrap, audit log | Authorization matrix and isolation tests; OTP and rate-limit tests |
| M2 | Catalog & venues: sports/formats, resource types, venues, facilities, resources and units, media, approval; public venue pages | Venue created → approved → public SEO page in Arabic and English |
| M3 | Scheduling: schedules, exceptions, holidays, blocks, occupancy constraint, availability engine, read-only calendar | Property tests; time-zone and business-day tests; split/combined overlap tests |
| M4 | Pricing: bands, special periods, quotes, snapshots, preview | Deterministic quote tests |
| M5 | Booking engine: holds, expiry, idempotency, outbox, confirmation (test provider / pay-at-venue), cancellation policy, manual and recurring bookings, email | Concurrency suite; expiry; venue-vs-marketplace conflict tests |
| M6 | Payments & finance: real provider adapter, webhooks, reconciliation, refunds, ledger, commission, payout statements | Payment lifecycle suite; ledger always balances |
| M7 | Venue operations: today view, calendar interactions, check-in, no-show, reports, staff | Venue daily-flow E2E |
| M8 | Player discovery & checkout polish: search, map, account, sharing, accessibility | Full player-loop E2E in Arabic and English |
| M9 | Hardening & pilot: security review, load tests, observability, export/deletion, legal pages, restore drill, pilot onboarding | Launch checklist signed off |

## AA. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Venues don't keep calendars current → real-world double bookings | Very high | Fastest block/add actions, mobile staff UX, venue-fault policy, recurring series |
| No suitable payment provider, or licensing limits on fund custody | Very high | Decide before M6; legal review; provider-neutral design; pay-at-venue fallback |
| No-shows on pay-at-venue bookings | High | Verified phone, hold caps, venue policy settings, reliability signals |
| SMS/WhatsApp OTP cost or delivery | Medium | Provider abstraction, rate limits, fallback channel |
| Refund fees and chargebacks | Medium | Explicit fee policy; chargebacks recorded as disputes |
| Arabic search quality | Medium | Normalization + trigrams; tests with real venue names |
| Scope creep into Phase 2/3 | High | Deferred list above; an ADR for any change |
| Unverified legal and tax assumptions | High | Legal review items in S |
| Small team / single point of knowledge | Medium | ADRs, runbooks, tests as documentation |

## AB. Architectural decisions

All approved on 2026-09-27. See [`docs/adr/`](./adr/README.md).

| # | Decision | ADR |
|---|---|---|
| 1 | Modular monolith: NestJS API (HTTP + worker), Next.js web (marketplace + `/manage`), Next.js admin on a separate origin | [0001](./adr/0001-modular-monolith.md) |
| 2 | Kysely + SQL-first migrations | [0002](./adr/0002-kysely-sql-first-migrations.md) |
| 3 | PostgreSQL 16 + PostGIS, btree_gist, pg_trgm, citext; schema per module; cross-module FKs allowed | [0003](./adr/0003-postgresql-extensions-and-schemas.md) |
| 4 | Occupancy model with atomic resource units + database exclusion constraint | [0004](./adr/0004-occupancy-exclusion-constraint.md) |
| 5 | Booking state split into lifecycle / payment / attendance / dispute | [0005](./adr/0005-booking-state-model.md) |
| 6 | Money in fils (`bigint`), single-point half-up rounding, largest-remainder allocation, double-entry ledger in MVP | [0006](./adr/0006-money-and-ledger.md) |
| 7 | Postgres job queue + transactional outbox; Redis only for rate limits and caches | [0007](./adr/0007-postgres-jobs-outbox-redis-cache.md) |
| 8 | Organization as tenant; application-layer enforcement + row-level security on tenant-private tables | [0008](./adr/0008-tenancy-and-row-level-security.md) |
| 9 | Better Auth (subject to M1 spike); phone OTP for players; mandatory 2FA for admins | [0009](./adr/0009-authentication.md) |
| 10 | REST + OpenAPI + zod contracts | [0010](./adr/0010-rest-openapi-zod-contracts.md) |
| 11 | Locale-prefixed URLs; translated content as `jsonb` | [0011](./adr/0011-locale-urls-and-translated-content.md) |
| 12 | pnpm + Turborepo | [0012](./adr/0012-pnpm-turborepo.md) |
| 13 | Test payment provider in dev/test only, hard-disabled in production | [0013](./adr/0013-test-payment-provider.md) |
| 14 | Slot crossing a price band priced by its start band | [0014](./adr/0014-price-by-start-band.md) |
| 15 | Manual payouts in the MVP | [0015](./adr/0015-manual-payouts.md) |
| 16 | Custom day/week resource calendar | [0016](./adr/0016-custom-resource-calendar.md) |

## AC. Open questions

Answered questions are recorded in [A.2](#a2-approved-product-decisions). Still open:

**Money (deferred until before M6 — not blocking earlier milestones)**
1. Commission model (percentage from venue, player service fee, or both); rates per venue; commission
   base before or after discounts.
2. Fund custody: platform collects and pays out (and payout schedule), or venues paid directly by the provider.
3. Commission collection on pay-at-venue bookings.
4. Cancellation policy: platform standard or per venue (templates); who absorbs refund fees.
5. Tax: tax-inclusive venue prices; service-fee taxability; receipts and e-invoicing obligations
   (accountant required).
6. Payment provider(s) and required methods (cards, Apple Pay, CliQ, wallets).

**Product**
7. Split-payment rule (option A / B / C in J) — before Phase 2.
8. Venue-fault policy when a venue double-books offline.
9. Slot durations and start alignment per sport (e.g. padel 60/90/120 minutes on the half hour) —
   configurable per resource either way; needed as seed defaults in M2/M3.

**Infrastructure & providers**
10. Hosting provider, region, budget, data-residency constraints.
11. Map provider; error tracking provider.
12. Email and SMS/WhatsApp providers.
13. Brand name, domain, logo and visual direction.
14. Pilot: number of venues, timeline, other contributors/reviewers.
