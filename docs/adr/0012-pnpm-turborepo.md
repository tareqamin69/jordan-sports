# 0012. pnpm workspaces and Turborepo

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §D](../architecture.md#d-monorepo-structure)

## Context

The repository contains three applications (api, web, admin) and shared packages (contracts, i18n,
ui, config, later money). We need strict dependency boundaries, reproducible installs, and fast,
cached builds and tests in CI.

## Decision

- **pnpm workspaces** (`apps/*`, `packages/*`, `tests/*`) with a committed lockfile and
  `packageManager` pinned in `package.json`.
- **Turborepo** orchestrates `build`, `lint`, `typecheck`, `test` and `test:integration` with
  dependency-aware ordering and caching.
- Shared packages are compiled to ESM with type declarations; applications depend on them through
  `workspace:*`.
- The whole repository is **ESM** (`"type": "module"`), matching NestJS 12 and Next.js.

## Consequences

- Undeclared dependencies fail fast (pnpm's strict `node_modules`).
- Local and CI task graphs are identical.
- Contributors need pnpm (via Corepack or a global install).

## Alternatives considered

- **npm/yarn workspaces:** looser dependency hoisting; no built-in task graph.
- **Nx:** powerful but heavier and more opinionated than needed.
