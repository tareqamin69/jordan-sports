# Development guide

## Requirements

- Node.js 22 (≥ 22.12; see `.nvmrc`)
- pnpm 10 (`packageManager` in `package.json`; Corepack or a global install)
- Docker with the Compose plugin (local Postgres/PostGIS and Redis)

## First-time setup

```bash
cp .env.example .env      # local-only values; .env is git-ignored
pnpm install
pnpm infra:up             # starts infra/docker/compose.yml and waits until healthy
pnpm build                # builds shared packages first, then apps
pnpm db:migrate           # applies apps/api/migrations to DATABASE_URL
```

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm dev` | Runs web (:3000), admin (:3001) and api (:4000) in watch mode |
| `pnpm build` | Builds every package and app (Turborepo, cached) |
| `pnpm typecheck` | TypeScript checks for every package |
| `pnpm lint` | ESLint for the whole repository (zero warnings allowed) |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm check:repo` | RTL-safety and sport-agnostic-core checks (`scripts/`) |
| `pnpm test` | Unit tests (no database needed) |
| `pnpm test:integration` | Integration tests against real PostgreSQL (needs `pnpm infra:up`) |
| `pnpm e2e` | Playwright tests against production builds (needs `pnpm build` and `pnpm db:migrate`) |
| `pnpm db:migrate` / `pnpm db:status` | Apply / inspect SQL migrations (status exits 1 if anything is pending) |
| `pnpm infra:up` / `pnpm infra:down` | Start / stop local infrastructure |
| `pnpm --filter @jordan-sports/api db:codegen` | Regenerate Kysely types from the migrated database (commit the result) |
| `ADMIN_PASSWORD=… pnpm --filter @jordan-sports/api admin:create -- --email … --name …` | Create a platform staff account; prints the authenticator secret once |

CI (`.github/workflows/ci.yml`) runs the same steps in this order: format, repository checks,
lint, build, typecheck, unit tests, migrations, integration tests, e2e.

## Configuration

- The API validates its environment at startup (`apps/api/src/platform/config/config.ts`) and
  refuses to start with invalid values. Error messages never print variable values.
- Outside production, the API loads the repository-root `.env`; variables already set in the
  environment always win. In production nothing is read from files.
- Never commit secrets. Only `.env.example` (with local-only values) is committed.

## Database and migrations

- Migrations are plain SQL files in `apps/api/migrations`, named `NNNN_snake_case_name.sql`
  ([ADR-0002](adr/0002-kysely-sql-first-migrations.md)).
- Each file runs in its own transaction; the runner records a SHA-256 checksum in
  `public.schema_migrations` and holds an advisory lock so concurrent runs are safe.
- **Never edit an applied migration.** The runner refuses to run if an applied file changed, and
  refuses new files numbered below the latest applied one. Fix mistakes with a new migration.
- Integration tests create a throwaway database per test suite on the server in `DATABASE_URL`
  and drop it afterwards (the database user needs `CREATEDB`, which the local compose user has).

## Signing in locally

- **Players / venue staff:** open http://localhost:3000/ar/sign-in and enter any Jordanian mobile
  number. No SMS is sent yet: the code is printed in the API log (`DEV ONLY — sign-in code…`) and
  can also be read from `GET http://localhost:4000/v1/dev/otp?phone=…` (development only).
- **Platform admin:** create an account with the `admin:create` command above, add the printed
  secret to an authenticator app (or compute codes from it), then sign in at
  http://localhost:3001/ar/sign-in.

## Conventions

- **Language:** code, identifiers, commit messages and documentation in English.
- **ESM everywhere** (`"type": "module"`). In the API and Node packages, relative imports use the
  `.js` extension (NodeNext resolution).
- **No hard-coded user-facing text.** All UI strings live in `packages/i18n/src/messages/*.ts`
  (ICU MessageFormat). The Arabic catalog is typed against the English one, so missing keys fail
  the build; tests also check placeholders. JSX text literals are a lint error.
- **RTL first.** Arabic is the default locale. Use logical utilities (`ms-`, `me-`, `ps-`, `pe-`,
  `start-`, `end-`, `text-start`); physical left/right utilities fail `pnpm check:repo`.
- **Western digits** in every locale: format numbers and dates with `toIntlLocale(locale)` from
  `@jordan-sports/i18n`.
- **Sport-agnostic core.** Sport names must not appear in `apps/api/src`; sports are data.
- **No fake functionality.** Do not add buttons, pages or flows that pretend to work.
- **Module boundaries (from M1).** Domain modules live in `apps/api/src/modules/<module>` and are
  imported only through their public `index.ts`.

## Local environment notes

- `pnpm e2e` starts production servers for web, admin and api automatically (and reuses already
  running ones locally). Playwright's Chromium must be installed
  (`pnpm --filter @jordan-sports/e2e exec playwright install chromium`) unless a matching browser
  is provided by the environment (`PLAYWRIGHT_BROWSERS_PATH`).
- Dependency install scripts are not run (`allowBuilds` in `pnpm-workspace.yaml`); pnpm still
  prints an "Ignored build scripts" notice for them, which is expected.
