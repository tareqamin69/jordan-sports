# Legal pages — DRAFT, pending legal review

**Internal. Not legal advice. Must be reviewed by a Jordanian lawyer before launch.**

The public pages below are drafts written by the product team to describe how the platform works
under the card-only payment model (ADR-0020). Nothing on the pages says "draft" to users; this file
and the header comment in `apps/web/src/content/legal.ts` are the internal markers.

| Page | Route | Content |
| --- | --- | --- |
| Terms & conditions (players) | `/terms` | `legalDocs.terms` |
| Venue owner terms | `/venue-terms` | `legalDocs.venueTerms` |
| Privacy policy | `/privacy` | `legalDocs.privacy` |
| How Jorena works + FAQ | `/how-it-works` | `legalDocs.howItWorks` |

## Points for the lawyer

- Jorena is the **merchant of record**: it collects the full booking amount by card, keeps its
  commission and pays the venue weekly. Check the licensing/agency implications with the acquiring
  bank (MEPS/bank TBD) and whether a payment-facilitator arrangement is needed.
- Refund rules: free-cancellation window → full refund; late cancel → venue rule 0/50/100%
  (snapshotted at booking); venue cancels → always full; no-show → no refund. Refund timing
  "5–10 business days".
- Consumer-protection wording for the late-cancel and no-show rules.
- Data retention for financial records (how many years under Jordanian law), and the 30-day account
  deletion promise.
- SMS (OTP and booking notices) and the SMS provider as a data processor.
- Governing law / jurisdiction clause.
- Minimum age (currently 16, from the sign-up checkbox).

When the text changes, bump `LEGAL_UPDATED_AT` in `apps/web/src/content/legal.ts`.
