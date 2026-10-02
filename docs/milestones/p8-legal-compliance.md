# P8 — Legal & compliance (Jordan PDPL), master plan phases 1–2

- **Status:** Shipped to staging 2026-10-02.
- **Checklist:** [`../compliance-checklist.md`](../compliance-checklist.md) (done / needs lawyer /
  needs owner input, data inventory, third parties).

## What shipped

**Phase 1 (audit of P7) — small gaps closed**
- SMS dates as `dd/MM/yyyy`; venue SMS shows the player's phone as `079 000 0000`.
- Copy fixes (إمتى / دقايق), legacy refund audit label.

**Phase 2 — legal & compliance**
- Pages (AR + EN, drafts for a lawyer): privacy rewritten for PDPL No. 24/2023, new `/refunds` and
  `/cookies`, venue terms gain a photo-rights section, terms state 18+ to pay. Footer links all of
  them; sign-up links terms + privacy; checkout links `/refunds`.
- Versioning: `LEGAL_TEXTS_VERSION` (contracts) is both the pages' "last updated" date and the
  version stored with each sign-up consent.
- Consent (migration 0028): `identity.users.terms_version/terms_accepted_at/marketing_opt_in_at`;
  append-only `identity.consents` (terms, marketing in/out, `adult_payment` per booking). Sign-up
  requires `acceptTerms: true`; checkout requires `confirmAdult: true`.
- Rights: "My account" → offers toggle + "Delete my account" (`POST /v1/me/delete`, immediate scrub,
  refused with upcoming bookings / venue ownership / staff). Admin → Users → Details → download
  JSON (`GET /v1/admin/users/:id/export`, `users.manage`, audited). New user status `deleted`.
- Company details in admin settings (name AR/EN, registration no., address AR/EN) → catalog →
  footer, privacy contact block, payment receipt. Empty = hidden.
- Payment receipt on the paid booking page (merchant, reg. no., reference, amount, paid date, card).
- "Report this photo" in the gallery lightbox and a report link on every venue page
  (`/support?venue=…&photo=N`, prefilled).
- Maps load on click only (registration wizard + its review step, admin review embed).
- Retention (migration 0029 + worker job `retention`, hourly): sign-in codes deleted after 7 days,
  ended sessions lose IP/user-agent after 90 days.
- Security: CSP + Permissions-Policy + COOP on web/admin (production builds); nodemailer → 10.x
  (`pnpm audit --prod` clean); secrets scan clean; backup/restore test passed.
- Tests: `privacy.test.ts` (6), settings company test, e2e `privacy.spec.ts` (sign-up consent,
  account privacy + deletion, legal pages + a11y, zero third-party requests + CSP header).

## Deliberately deferred

- Email receipts (players have no email); marketing sending (nothing sends offers yet).
- Real payment gateway (plan §6).

## Open decisions (owner / lawyer)

- Company name, registration no., address — fill in Admin → Settings.
- Hosting provider + country for the privacy page; retention years for financial records; name of
  the data-protection authority; breach-response runbook.
