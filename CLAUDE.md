# Working rules for Claude sessions on this repo

These reduce token usage across long sessions. Follow them unless the user says otherwise for a
specific task.

## Efficiency rules

- **No subagents / multi-agent workflows** unless the user explicitly asks for one.
- **Read files once.** Don't re-read a file already seen this session unless it changed on disk
  (the harness flags changes) or enough time/edits have passed that the content is genuinely
  uncertain.
- **Scoped tests during work.** While implementing a change, run only the unit/integration test
  files relevant to what changed (e.g. `npx vitest run --project unit path/to.test.ts`). Run the
  **full** suite — `pnpm test`, `pnpm test:integration`, and all Playwright e2e projects — only
  once, at the end of a milestone/phase, before marking it done.
- **Screenshots at milestone end only.** Max 3–4, only for screens that actually changed in that
  milestone. Don't screenshot mid-implementation.
- **Short reports.** Status updates to the user: 3–5 lines, simple Jordanian-colloquial Arabic (see
  language rules below). No long recaps.
- **Keep `docs/milestones/*.md` current** as each milestone lands, so a new session can pick up
  work from those docs plus this file without re-reading the whole codebase. Each milestone doc
  should say: what shipped, what's deliberately deferred, and any open decisions.

## Product/session conventions (see docs/architecture.md for the full spec)

- Talk to the user in simple, Jordanian-colloquial Arabic. Keep all code, filenames, commit
  messages, comments and docs in English; technical terms may appear in English in brackets.
- Branch: `claude/inspect-repo-environment-c0iptd`. Push there; never push to a different branch
  without explicit permission. Don't open a PR unless asked.
- Staging deployment auto-updates from this branch every 5 minutes (`infra/staging/update.sh`).
  Keep it green: don't push code that fails `pnpm build`/`pnpm typecheck`/`pnpm lint` or breaks the
  staging smoke test.
- Money: integer minor units (fils) only, never floats. See ADR-0006.
- Multi-tenancy / authorization: organization membership via `VenueAccessService`/
  `MembershipsService`, never inferred from UI mode. See ADR-0008.
- Current active plan: `docs/plans/jordan-wide-cliq-marketplace.md` (Jordan-wide geography, two
  interfaces, venue self-registration, CliQ payments, prepaid commission ledger). Work through its
  phases (P1–P6) in order; update it (or the relevant milestone doc) as phases land.
- Do not start real payment-gateway integration (Visa/cards) beyond the abstraction — that's
  explicitly deferred (see the plan's §6).
