# P1–P6 — Jordan-wide marketplace, two interfaces, self-registration, CliQ payments, prepaid commission

Tracks implementation of `docs/plans/jordan-wide-cliq-marketplace.md` (approved 2026-09-27, all §8
decisions resolved — see that file for the decided values, including the owner's D2 addition:
48-hour refund escalation). Read that plan file first for the full design; this doc tracks
what's shipped so a new session can resume without re-reading everything.

## Status

| Phase | Status |
|---|---|
| P1 — Jordan-wide geography | In progress |
| P2 — Two interfaces, mode switch | Not started |
| P3 — Venue self-registration wizard, review queue | Not started |
| P4 — CliQ payment flow | Not started |
| P5 — Prepaid balance & commission | Not started |
| P6 — Gateway questions doc (done, in the plan §Appendix B), full e2e run, ADRs | Not started |

## P1 notes (update as it lands)

- Migration adds governorates as the top level of `catalog.cities` (table name unchanged), with
  main areas per governorate per plan Appendix A.
- `listVenues`/search take `governorate` + `area`; area must belong to governorate.
- Admin catalog screen to add/rename/reorder areas & governorates without a release.
- Web search bar: governorate → area cascading select; "anywhere in Jordan" default; home page
  copy no longer says "Amman" specifically.

(Fill in the rest as each phase completes — file paths touched, migration numbers, any deviation
from the plan, and follow-up items.)
