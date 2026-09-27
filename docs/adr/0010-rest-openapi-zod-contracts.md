# 0010. REST with OpenAPI generated from zod contracts

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §N](../architecture.md#n-api-architecture)

## Context

The API serves the web app, the admin app and, later, a native mobile app. Contracts must be validated
at runtime, typed at compile time, versioned, and consumable by non-TypeScript clients.

## Decision

- **REST** over HTTPS, versioned under `/v1`; operational endpoints (`/healthz`, `/readyz`) are
  unversioned.
- Request/response schemas are written once as **zod** schemas in `packages/contracts`, used for runtime
  validation in the API and for types in the frontends.
- An **OpenAPI** document is generated from the contracts; a typed client is generated from it for web
  and admin (and later mobile).
- Errors follow **RFC 9457 problem details** with a stable machine-readable `code`; clients translate
  codes into Arabic/English messages.
- Money is `{ amount: <integer minor units>, currency }`; times are ISO 8601 UTC with venue-local
  fields and `timeZone`.
- Mutating booking/payment/refund/cancellation requests require an `Idempotency-Key` header.

## Consequences

- A single source of truth for contracts; drift between API and clients is caught at build time.
- Non-TypeScript clients (mobile, partners) use the OpenAPI document.

## Alternatives considered

- **tRPC:** great TypeScript DX but couples clients to TypeScript and makes public/mobile versioning
  harder.
- **GraphQL:** flexible, but unnecessary complexity and harder caching/authorization for this domain.
