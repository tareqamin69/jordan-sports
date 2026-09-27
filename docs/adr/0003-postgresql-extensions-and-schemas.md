# 0003. PostgreSQL 16 with extensions and a schema per module

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §F](../architecture.md#f-database-architecture)

## Context

PostgreSQL is the preferred primary database and the single source of truth for bookings and
payments. We need overlap prevention on time ranges, geospatial search, fuzzy/Arabic-friendly text
search and case-insensitive email uniqueness. We also want module boundaries visible in the database so
modules can be extracted later.

## Decision

- **PostgreSQL 16** everywhere (local, CI, production).
- Extensions enabled by migration: **PostGIS** (geography, `ST_DWithin`), **btree_gist** (equality +
  range operators in one GiST exclusion constraint), **pg_trgm** (trigram search), **citext**
  (case-insensitive emails).
- **One Postgres schema per module** (e.g. `identity`, `tenancy`, `catalog`, `venue`, `resource`,
  `scheduling`, `pricing`, `booking`, `payment`, `finance`, `notification`, `audit`), created by the
  migration that introduces the module's first table.
- **Cross-module foreign keys are allowed.** Integrity outranks service purity at this stage; a module
  extraction would replace them with application-level checks at that time.

## Consequences

- Managed hosting must support PostGIS and these extensions (most major managed Postgres offerings do;
  to be verified when hosting is chosen).
- Local development uses the `postgis/postgis:16-3.4` image.
- Table ownership per module is obvious from the schema name, and grants can be scoped per schema.

## Alternatives considered

- **No PostGIS (haversine SQL + bounding boxes):** workable at Amman scale, but PostGIS is the
  standard, indexable and future-proof for regional expansion.
- **Everything in `public`:** simpler search paths, but module ownership becomes a naming convention
  only.
- **Dedicated search engine:** not justified by scale; Postgres text search + trigrams first.
