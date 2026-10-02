# Legal pages — DRAFT, pending legal review

**Internal. Not legal advice. Must be reviewed by a Jordanian lawyer before launch.**

The public pages below are drafts written by the product team to describe how the platform works
under the card-only payment model (ADR-0020). Nothing on the pages says "draft" to users; this file
and the header comment in `apps/web/src/content/legal.ts` are the internal markers.

| Page | Route | Content |
| --- | --- | --- |
| Terms & conditions (players) | `/terms` | `legalDocs.terms` |
| Venue owner terms | `/venue-terms` | `legalDocs.venueTerms` |
| Privacy policy | `/privacy` | `legalDocs.privacy` (+ company/contact block from settings) |
| Cancellation & refund policy | `/refunds` | `legalDocs.refunds` |
| Cookie policy | `/cookies` | `legalDocs.cookies` |
| How Jorena works + FAQ | `/how-it-works` | `legalDocs.howItWorks` |

## Points for the lawyer

- Jorena is the **merchant of record**: it collects the full booking amount by card, keeps its
  commission and pays the venue weekly. Check the licensing/agency implications with the acquiring
  bank (MEPS/bank TBD) and whether a payment-facilitator arrangement is needed.
- Refund rules: free-cancellation window → full refund; late cancel → venue rule 0/50/100%
  (snapshotted at booking); venue cancels → always full; no-show → no refund. Refund timing
  "5–10 business days".
- Consumer-protection wording for the late-cancel and no-show rules.
- Data retention for financial records (how many years under Jordanian law). Account deletion is
  now immediate and self-service (personal fields scrubbed; bookings/payments kept unlinked).
- PDPL No. 24/2023: legal bases, cross-border transfer to the hosting provider (likely EU),
  breach-notice wording and the authority's name, the 30-day reply for access requests.
- Photo licence granted by venue owners (`venueTerms#photos`).
- 16+ to sign up, 18+ to pay by card (confirmation logged per booking in `identity.consents`).
- SMS (OTP and booking notices) and the SMS provider as a data processor.
- Governing law / jurisdiction clause.

When the text changes, bump `LEGAL_TEXTS_VERSION` in `packages/contracts/src/identity.ts`: it is
the "last updated" date on every page and the version recorded with each sign-up consent.

See also [`../compliance-checklist.md`](../compliance-checklist.md).
