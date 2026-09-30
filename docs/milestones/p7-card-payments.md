# P7 — Card-only payments, payouts, copy rewrite, legal drafts

- **Status:** Shipped to staging 2026-09-30.
- **Decision:** [ADR-0020](../adr/0020-card-only-payments-merchant-of-record.md), which supersedes
  ADR-0018 (CliQ + prepaid balance).

## What shipped

**Payments (card only, Jorena is the merchant of record)**
- Booking: pick a time → hold → pay the full amount by card (hosted checkout) → confirmed. Checkout
  extends the hold to ≥15 min. The worker reconciles players who never return (every 60 s) and
  abandons attempts after 60 min. A payment that lands after its hold was lost is refunded in full.
- `PaymentGateway` port + `MockGateway` (staging): test page `/[locale]/pay/test/[sessionId]`.
  Test cards: `4242 4242 4242 4242` / `5555 5555 5555 4444` succeed, `4000 0000 0000 0002`
  declined, `4000 0000 0000 9995` insufficient funds. Production refuses `PAYMENT_GATEWAY=mock`
  unless `STAGING=true`, and preflight fails while it is set (**launch only with a live gateway**).
- The return from the payment page goes to the web origin the player came from (if it is in
  `WEB_ORIGINS`), so the session cookie is still there.
- Refunds: free window → 100%; late → venue rule 0/50/100% (snapshotted at hold); venue/admin
  cancel → 100%; no-show → 0. Sent after commit, retried by the worker (5×), admin retry after that.
  Players see the refund preview before cancelling and "5–10 business days".
- Venue "المستحقات" tab: totals (due / next payout / upcoming / paid), per-booking gross /
  commission / net, weekly schedule (Sundays), payout history, owner-only IBAN card
  (`payouts.manage`). The registration wizard's last data step is contact + optional IBAN.
- Admin: **تحويلات الملاعب** `/payouts` (due per venue with IBAN, record transfer with reference;
  `expectedNet` guard) and **الدفعات والاسترجاعات** `/payments` (charges and refunds, filters,
  retry failed refunds).
- Removed: CliQ checkout, venue payments/balance tabs, admin balance card, `cliqPayments` setting
  flag and `FEATURE_CLIQ_PAYMENTS`. Old CliQ/ledger tables stay in the DB (history only).

**Copy and UX**
- All pay-at-venue wording replaced; one Jordanian dialect; Western digits; "الملعب" = venue,
  "ساحة" = bookable unit everywhere; "ما إجا" (one) / "ما إجو" (count).
- Pricing "priority" removed from the UI: overlaps resolve automatically (dated band first, then the
  narrower band, then newest).
- Phone hints use a local example (0791234567); the API already normalizes 07…/+962….
- Support email comes from admin settings (`support_email`, migration 0027); hidden while empty.
- Admin: sport icon picker (icons moved to `@jordan-sports/ui` `SportIcon`), catalog keys
  auto-generated from the English name, audit filters as labelled dropdowns, map picker in the
  venue editor (maplibre, lazy-loaded).
- OTP SMS and admin sign-in email in dialect.
- `signIn.devNotice` only renders with the console OTP channel on dev/staging; production config
  refuses the console channel, so it never shows there.

**Legal (drafts for a lawyer, internal marker only)** — `apps/web/src/content/legal.ts`,
`docs/legal/README.md`: `/terms`, `/venue-terms`, `/privacy`, `/how-it-works` (+ FAQ). Linked from
the footer, the booking terms box and the registration review step.

## Deliberately deferred
- The real gateway (MEPS or bank acquirer) — only the port and the mock exist (CLAUDE.md rule).
- Automatic payouts / bank API; payouts are recorded by hand after a bank transfer.
- Account-deletion self-service (privacy page promises handling by request within 30 days).
- Saved cards, Apple/Google Pay.

## Open decisions
- Which gateway, and its refund/settlement timing (update "5–10 business days" if different).
- Default commission for launch (admin setting) and the payout weekday (currently Sunday).
- Lawyer review of the legal drafts (see `docs/legal/README.md`).

## Copy keys changed (ar + en)

Also changed outside the catalogs: OTP SMS text (`releans-otp-sender.ts`), admin sign-in email,
and all legal page text (`content/legal.ts`).

### Changed (97)
- `admin.audit.actions`: `finance_balance_adjusted`, `resource_created`, `resource_updated`
- `admin.audit.targets`: `resource`
- `admin.dashboard.periods`: `month`, `week`
- `admin.geography.icon`: `admin.geography.icon`
- `admin.geography.iconHint`: `admin.geography.iconHint`
- `admin.geography.keyHint`: `admin.geography.keyHint`
- `admin.geography.resourceType`: `admin.geography.resourceType`
- `admin.geography.sportsHint`: `admin.geography.sportsHint`
- `admin.organizations.description`: `admin.organizations.description`
- `admin.oversight.rating`: `private`, `tags.cancels_often`
- `admin.oversight.stats`: `noShows`
- `admin.settings.readOnly`: `admin.settings.readOnly`
- `admin.setup.missing`: `admin.setup.missing`
- `admin.setup.step1`: `admin.setup.step1`
- `admin.setup.step2`: `admin.setup.step2`
- `admin.setup.step3`: `admin.setup.step3`
- `admin.users.memberships`: `admin.users.memberships`
- `admin.users.reliability`: `noShows`
- `admin.venues.addResource`: `admin.venues.addResource`
- `admin.venues.combines`: `admin.venues.combines`
- `admin.venues.combinesHint`: `admin.venues.combinesHint`
- `admin.venues.contactPhone`: `admin.venues.contactPhone`
- `admin.venues.locationHint`: `admin.venues.locationHint`
- `admin.venues.pendingDescription`: `admin.venues.pendingDescription`
- `admin.venues.resourceCount`: `admin.venues.resourceCount`
- `admin.venues.resources`: `admin.venues.resources`
- `admin.venues.summary`: `courts`, `noCourts`
- `common.errors`: `PAYMENT_REQUIRED`
- `notifications.bookingCancelled`: `notifications.bookingCancelled`
- `notifications.bookingCancelledByVenue`: `notifications.bookingCancelledByVenue`
- `notifications.bookingConfirmed`: `notifications.bookingConfirmed`
- `notifications.venueNewBooking`: `notifications.venueNewBooking`
- `web.about`: `body1`
- `web.availability`: `anyCourt`, `bookHint`, `chooseCourt`, `courtMode`
- `web.booking`: `accept`, `cancelQuestion`, `confirmed`, `freeCancellationUnavailable`, `freeUntil`, `lateNote`, `lateQuestion`, `release`, `released`, `resource`, `statuses.HELD`, `termsDetails`
- `web.home`: `description`, `picksTitle`
- `web.manage.bookings`: `add`, `added`, `cutoffHint`, `cutoffTitle`, `resource`, `weeks`
- `web.manage.calendar`: `noHoursBody`, `resource`
- `web.manage.closures`: `intro`
- `web.manage.hours`: `copyToAll`, `intro`
- `web.manage.pricing`: `allCourts`, `intro`, `resources`
- `web.manage.profile`: `uploadHint`
- `web.manage.register`: `addCourt`, `contactIntro`, `courtsIntro`, `needsCourt`, `noCourts`, `paymentIntro`, `phoneHint`, `steps.courts`, `steps.payment`, `submitted`, `submittedHint`, `whatsappHint`
- `web.manage.rules`: `alignment`, `lead`
- `web.manage.status`: `submitted`
- `web.manage.team`: `intro`, `ownerConfirmPrompt`, `ownerWarning`, `roleHelp.staff`
- `web.pwa`: `dismiss`, `installBody`, `iosTitle`
- `web.signIn`: `modePlayerBody`
- `web.venue`: `combines`, `resources`
- `web.venues`: `searchDescription`

### Added (152)
- `admin.audit.actions`: `finance_payout_account_set`, `finance_payout_recorded`, `payment_refund_retried`
- `admin.audit.filters`: `anyAction`, `anyTarget`
- `admin.geography.iconNames`: `ball-beach`, `ball-bounce`, `ball-generic`, `ball-handball`, `ball-kick`, `ball-volley`, `bowling-pin`, `cue-ball`, `dumbbell`, `glove`, `goal-net`, `paddle-tt`, `racket-paddle`, `racket-squash`, `racket-string`, `shuttlecock`, `track-oval`, `wave`
- `admin.nav.payments`: `admin.nav.payments`
- `admin.nav.payouts`: `admin.nav.payouts`
- `admin.payments.all`: `admin.payments.all`
- `admin.payments.attempts`: `admin.payments.attempts`
- `admin.payments.card`: `admin.payments.card`
- `admin.payments.description`: `admin.payments.description`
- `admin.payments.failure`: `admin.payments.failure`
- `admin.payments.kind`: `admin.payments.kind`
- `admin.payments.kinds`: `charge`, `refund`
- `admin.payments.minus`: `admin.payments.minus`
- `admin.payments.more`: `admin.payments.more`
- `admin.payments.reasons`: `admin`, `customer_free`, `customer_late`, `expired`, `venue`
- `admin.payments.retried`: `admin.payments.retried`
- `admin.payments.retry`: `admin.payments.retry`
- `admin.payments.search`: `admin.payments.search`
- `admin.payments.status`: `admin.payments.status`
- `admin.payments.statuses`: `failed`, `pending`, `succeeded`
- `admin.payments.title`: `admin.payments.title`
- `admin.payouts.account`: `admin.payouts.account`
- `admin.payouts.bookings`: `admin.payouts.bookings`
- `admin.payouts.cancel`: `admin.payouts.cancel`
- `admin.payouts.commission`: `admin.payouts.commission`
- `admin.payouts.confirm`: `admin.payouts.confirm`
- `admin.payouts.cutoff`: `admin.payouts.cutoff`
- `admin.payouts.description`: `admin.payouts.description`
- `admin.payouts.dueEmpty`: `admin.payouts.dueEmpty`
- `admin.payouts.dueTitle`: `admin.payouts.dueTitle`
- `admin.payouts.gross`: `admin.payouts.gross`
- `admin.payouts.markPaid`: `admin.payouts.markPaid`
- `admin.payouts.marked`: `admin.payouts.marked`
- `admin.payouts.minus`: `admin.payouts.minus`
- `admin.payouts.net`: `admin.payouts.net`
- `admin.payouts.noAccount`: `admin.payouts.noAccount`
- `admin.payouts.paidEmpty`: `admin.payouts.paidEmpty`
- `admin.payouts.paidLine`: `admin.payouts.paidLine`
- `admin.payouts.paidTitle`: `admin.payouts.paidTitle`
- `admin.payouts.reference`: `admin.payouts.reference`
- `admin.payouts.referenceHint`: `admin.payouts.referenceHint`
- `admin.payouts.title`: `admin.payouts.title`
- `admin.settings.supportEmail`: `admin.settings.supportEmail`
- `admin.settings.supportEmailHint`: `admin.settings.supportEmailHint`
- `common.errors`: `INVALID_IBAN`, `NOTHING_TO_PAY_OUT`, `PAYMENT_GATEWAY_UNAVAILABLE`, `PAYOUT_ACCOUNT_MISSING`, `PAYOUT_AMOUNT_CHANGED`, `REFUND_NOT_RETRYABLE`
- `web.booking`: `failures.abandoned`, `failures.cancelled`, `failures.card_declined`, `failures.expired_card`, `failures.insufficient_funds`, `failures.other`, `fullTerms`, `paid`, `pay`, `payCard`, `paySecure`, `paying`, `paymentFailed`, `refund`, `refundPreview`, `refundTiming`, `verifying`
- `web.contact`: `report`, `reportLink`
- `web.footer`: `howItWorks`, `venueTerms`
- `web.legal`: `related`
- `web.manage.bookings`: `lateRefund`, `lateRefunds.0`, `lateRefunds.100`, `lateRefunds.50`
- `web.manage.earnings`: `account`, `bookingsTitle`, `commission`, `due`, `empty`, `gross`, `intro`, `minus`, `net`, `noAccount`, `paid`, `payoutLine`, `payoutsEmpty`, `payoutsTitle`, `pending`, `refunded`, `schedule`, `statuses.due`, `statuses.paid`, `statuses.pending`, `statuses.upcoming`, `upcoming`
- `web.manage.payoutAccount`: `bank`, `holder`, `iban`, `ibanHint`, `intro`, `save`, `saved`, `title`
- `web.manage.register`: `termsNote`
- `web.manage.tabs`: `earnings`
- `web.testPay`: `amount`, `back`, `cardDeclined`, `cardFunds`, `cardNumber`, `cardOk`, `cvc`, `done`, `expiry`, `invalid.invalid_card`, `invalid.invalid_cvc`, `invalid.invalid_expiry`, `missing`, `pay`, `testCards`, `testMode`, `title`

### Removed (113)
- `admin.audit.filters`: `actionHint`
- `admin.balance.adjust`: `admin.balance.adjust`
- `admin.balance.adjusted`: `admin.balance.adjusted`
- `admin.balance.amount`: `admin.balance.amount`
- `admin.balance.credit`: `admin.balance.credit`
- `admin.balance.debit`: `admin.balance.debit`
- `admin.balance.direction`: `admin.balance.direction`
- `admin.balance.hidden`: `admin.balance.hidden`
- `admin.balance.history`: `admin.balance.history`
- `admin.balance.invalidAmount`: `admin.balance.invalidAmount`
- `admin.balance.kinds`: `adjustment`, `commission`, `commission_reversal`, `topup`
- `admin.balance.levels`: `empty`, `low`, `ok`
- `admin.balance.noEntries`: `admin.balance.noEntries`
- `admin.balance.overdueRefunds`: `admin.balance.overdueRefunds`
- `admin.balance.reason`: `admin.balance.reason`
- `admin.balance.save`: `admin.balance.save`
- `admin.balance.title`: `admin.balance.title`
- `admin.balance.visible`: `admin.balance.visible`
- `admin.settings.cliqPayments`: `admin.settings.cliqPayments`
- `admin.settings.flagDefault`: `admin.settings.flagDefault`
- `admin.settings.flagHint`: `admin.settings.flagHint`
- `admin.settings.off`: `admin.settings.off`
- `admin.settings.on`: `admin.settings.on`
- `common.errors`: `PAYMENT_AWAITING_VENUE`, `PAYMENT_NOT_PENDING`, `PAYMENT_REFERENCE_USED`, `REFUND_NOT_DUE`, `VENUE_NOT_ACCEPTING_BOOKINGS`
- `web.about`: `body3`
- `web.booking`: `awaitingVenue`, `cliq.awaitingBody`, `cliq.awaitingCountdown`, `cliq.awaitingTitle`, `cliq.copied`, `cliq.copy`, `cliq.dueNow`, `cliq.fullNow`, `cliq.holder`, `cliq.paid`, `cliq.paidFull`, `cliq.payTo`, `cliq.referenceHint`, `cliq.referenceLabel`, `cliq.refundDue`, `cliq.refunded`, `cliq.rejected`, `cliq.remainder`, `cliq.send`, `cliq.steps`, `cliq.terms`, `cliq.termsLate`, `cliq.unconfirmed`, `confirm`, `payAtVenue`
- `web.manage.balance`: `booking`, `current`, `hidden`, `history`, `howToTopUp`, `intro`, `kinds.adjustment`, `kinds.commission`, `kinds.commission_reversal`, `kinds.topup`, `levels.empty`, `levels.low`, `levels.ok`, `noEntries`, `open`, `overdueRefunds`, `threshold`, `visible`
- `web.manage.payments`: `confirmedDone`, `deadline`, `intro`, `markRefunded`, `notReceived`, `overdue`, `reasonDefault`, `reasonLabel`, `received`, `reference`, `refundSince`, `refundedDone`, `refundsEmpty`, `refundsTitle`, `rejectedDone`, `sendRejection`, `toConfirmEmpty`, `toConfirmTitle`
- `web.manage.pricing`: `priorities.high`, `priorities.highest`, `priorities.low`, `priorities.normal`, `priority`
- `web.manage.register`: `cliqAlias`, `cliqAliasHint`, `cliqHolder`, `depositHint`, `depositPercentage`
- `web.manage.tabs`: `balance`, `payments`
- `web.privacy`: `body`, `description`, `title`
- `web.terms`: `body`, `description`, `title`
