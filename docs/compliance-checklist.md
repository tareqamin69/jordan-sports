# Compliance checklist — Jordan PDPL, card payments, consumer law

**Internal.** Status of each compliance item from the master plan's Phase 2. Legend:

- ✅ **done** — shipped and covered by tests
- ⚖️ **needs lawyer** — implemented as a draft; a Jordanian lawyer must review
- 🙋 **needs owner input** — waiting on information or a decision from the business owner

Legal texts: `apps/web/src/content/legal.ts` (see [`legal/README.md`](./legal/README.md)).
Version: `LEGAL_TEXTS_VERSION` in `packages/contracts/src/identity.ts` (shown as "last updated" and
recorded with every sign-up consent).

## 1. Legal pages (AR + EN)

| Item | Status | Where |
| --- | --- | --- |
| Privacy policy: data, purpose, legal basis, sharing (venue / SMS / gateway / hosting / maps), retention, rights, breach notice, children, contact | ✅ ⚖️ | `/privacy` |
| Player terms (16+ to sign up, 18+ to pay) | ✅ ⚖️ | `/terms` |
| Venue-owner terms: commission, weekly payouts, cancellations, **photo rights** | ✅ ⚖️ | `/venue-terms` (`#photos`) |
| Google Maps import: only the pasted link (and, with a Places key, a name search near the pin) goes to Google; no personal data; Google photos never copied; results cached 30 days | ✅ | `venue-import` module, `docs/google-places-setup.md` |
| Refund & cancellation policy, matching `refundAmount()` in `payments/domain/payment-rules.ts` | ✅ ⚖️ | `/refunds` |
| Cookie policy (essential cookies only, listed by name) | ✅ ⚖️ | `/cookies` |
| How it works + FAQ | ✅ | `/how-it-works` |
| Linked from footer | ✅ | all six (+ about/contact) |
| Linked from sign-up | ✅ | terms + privacy in the consent checkbox |
| Linked from checkout | ✅ | "Full terms" → `/refunds`; rules summary above the pay button |
| Hosting provider named and its country (cross-border transfer wording) | 🙋 ⚖️ | privacy says "may be outside Jordan" |
| Name of the data-protection authority for complaints | ⚖️ | privacy says "the competent Jordanian authority" |
| Retention period for financial records (years) | ⚖️ | privacy says "as long as the law requires" |

## 2. Business details

| Item | Status | Notes |
| --- | --- | --- |
| Company name (AR/EN), registration no., address in admin settings | ✅ | Admin → Settings → Company details (owner only, audited) |
| Shown in footer, privacy page, payment receipt | ✅ | hidden while empty; never invented |
| Actual values | 🙋 | owner to fill in once the company is registered |

## 3. Consent

| Item | Status | Notes |
| --- | --- | --- |
| Sign-up checkbox (terms + privacy), unticked, required | ✅ | API requires `acceptTerms: true` |
| Store text version + timestamp | ✅ | `identity.users.terms_version/terms_accepted_at` + append-only `identity.consents` |
| Marketing opt-in separate and unticked; stop any time | ✅ | sign-up + "My account"; each change logged |
| Cookie banner | ✅ not needed | only essential cookies (`js_session`, admin-only `js_admin_session`/`js_admin_device`) and a localStorage install-prompt flag; no analytics/ads. Policy promises consent (equal-prominence reject) if that ever changes |
| Marketing messages actually sent | 🙋 | none yet; any future campaign must target `marketing_opt_in_at IS NOT NULL` only |

## 4. Age

| Item | Status | Notes |
| --- | --- | --- |
| 16+ confirmation at sign-up | ✅ | `age_confirmed_at` |
| 18+ confirmation before card payment, logged | ✅ | checkout requires `confirmAdult: true`; `identity.consents` row `adult_payment` with the booking |

## 5. Data minimisation

**Data inventory** (personal data only):

| Table | Personal fields | Why | Kept |
| --- | --- | --- | --- |
| `identity.users` | phone, email (staff), display_name, locale, consents timestamps | account, sign-in, venue contact | until deletion (then scrubbed) |
| `identity.consents` | user_id, kind, version, booking_id | proof of consent | with financial records |
| `identity.otp_challenges` | phone, code hash | sign-in | **7 days** (worker `retention` job) |
| `identity.sessions` | ip, user_agent | security | details cleared **90 days** after the session ends; cleared at once on account deletion |
| `booking.bookings` | customer_user_id, note | the booking | financial records |
| `booking.venue_customers` | name, phone | venue's own walk-in/phone customers (entered by the venue) | venue's responsibility |
| `payment.transactions` | card brand + last 4 only, gateway ref | payments/refunds | financial records |
| `finance.payout_accounts` | IBAN (owner), audit keeps last 4 only | weekly payouts | while the venue is active |
| `support.complaints` | free-text body | follow-up | financial/dispute records |
| `audit.audit_logs` | actor, IP | security/accountability | append-only |

| Item | Status | Notes |
| --- | --- | --- |
| No field collected without a purpose | ✅ | no date of birth, no address, no ID for players |
| No session replay / heatmaps / analytics | ✅ | none installed |
| Fonts, icons, scripts self-hosted | ✅ | `@fontsource` packages, inline SVG icons, no CDN |
| Third-party requests on page load | ✅ none | e2e `privacy.spec.ts` asserts zero non-local requests on home, venue and help pages |
| Location used on the device only | ✅ | asked through an in-page card first (the browser prompt only after "Yes, use my location"); coordinates stay in memory for sorting; the server only gets `located=1` ("venues on the map"); the device remembers the choice (geo / governorate / later), never the coordinates |
| Map loads on click only | ✅ | venue page, registration wizard (`open-location-map`), wizard review step, admin review (OSM embed). Admin venue editor loads it only when a venue is opened for editing (staff-only) |
| Third parties when the map is opened | ℹ️ | `tiles.openfreemap.org` (vector), `tile.openstreetmap.org` (fallback), `www.openstreetmap.org` (admin embed) |
| Outbound links (user-initiated) | ℹ️ | `wa.me`, Google Maps directions, Google Calendar |
| "Delete my account" | ✅ | My account → immediate; refused with upcoming bookings or while owning a venue; scrubs personal fields, ends sessions, removes sign-in codes |
| Admin data export (access requests) | ✅ | Admin → Users → Details → "Download their data (JSON)"; `users.manage` only; audited |

## 6. Honesty

| Item | Status | Notes |
| --- | --- | --- |
| No fake reviews, ratings, counters or claims | ✅ | no public ratings; counts come from real data; copy reviewed |
| Demo venues never in production | ✅ | `seed-demo` refuses in production; `preflight` fails on demo org/venues/owner; `go-live.sh` purges |
| "Report this photo" | ✅ | gallery lightbox → `/support?venue=…&photo=N` (prefilled); "Something wrong with this venue?" link on every venue page |

## 7. Receipts

| Item | Status | Notes |
| --- | --- | --- |
| Total before paying | ✅ | price on the booking card + pay button shows the amount |
| Rules before paying | ✅ | free-cancel deadline, late rule, refund timing above the pay button; 18+ & rules checkbox |
| Receipt with company name, reference, amount, date | ✅ | "Payment receipt" on the paid booking (company from settings, else brand; reg. no.; card brand + last 4); confirmation SMS carries brand, reference, amount, date |
| Email receipts | 🙋 | players sign up by phone only; add if email collection is wanted |

## 8. Security

| Item | Status | Notes |
| --- | --- | --- |
| HTTPS + HSTS | ✅ | Caddy (Let's Encrypt), `Strict-Transport-Security: max-age=31536000` |
| Secure cookies | ✅ | HttpOnly, SameSite=Lax, Secure in production |
| CSP + security headers | ✅ | web/admin `next.config.ts` (production): CSP (`frame-ancestors 'none'`, `object-src 'none'`, map hosts only), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP |
| CSRF | ✅ | origin guard on state-changing requests |
| Rate limits | ✅ | OTP send/verify, sign-in, checkout, uploads (Redis) |
| Dependency audit | ✅ | `pnpm audit --prod`: 0 known (nodemailer upgraded to 10.x on 2026-10-02) |
| No secrets in the repo | ✅ | scanned 2026-10-02: only CI-only dummies and `CHANGE-ME` templates |
| Backups tested | ✅ | `infra/backup/test-backup-restore.sh` passed 2026-10-02 (encrypted, off-site, restore compared table by table) |
| Card data | ✅ | never touches Jorena (hosted payment page); brand + last 4 only |
| Breach-response procedure (who notifies whom, within how long) | ⚖️ 🙋 | policy promises notice; internal runbook to be written with the lawyer |
| Payment gateway contract / PCI SAQ-A | 🙋 | real gateway deferred (plan §6); hosted page keeps scope at SAQ-A |
