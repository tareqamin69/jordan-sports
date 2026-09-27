# M2 — Catalog & venues

- **Status:** Complete (2026-09-27)
- **Scope (architecture §Z):** sports/formats, resource types, venues, facilities, resources and units,
  media, approval; public venue pages.
- **Done when:** venue created → approved → public SEO page in Arabic and English.

## What was built

| Area | Delivered |
|---|---|
| Database | Migration `0003`: `catalog`, `venue`, `resource` schemas; localized-text checks; PostGIS location; resource units; default booking policies |
| Catalog (data, not code) | Football (5/6/7/11-a-side), Padel (doubles), Tennis (singles/doubles); pitch/court types with attribute schemas; 8 amenities; Amman + 12 areas |
| Venues | Admin-created (pilot): profile in Arabic/English, area, address, coordinates, phone, amenities, business-day start; status workflow draft → approved → suspended with audited reasons; approval requires an active resource |
| Resources | Typed resources with validated attributes and compatible formats; facilities; **combined resources** (e.g. full pitch = two halves) sharing units, with overlap shown to admins |
| Photos | Upload JPEG/PNG/WebP (≤10 MB) → re-encoded WebP ≤2000 px, all metadata (GPS) stripped; public only for approved venues; filesystem storage behind a `MediaStorage` interface |
| Public site | Home with sports from the catalog; venue directory with sport/area filters; venue page (photos, courts with features, amenities, address, call button, WhatsApp share); JSON-LD, hreflang, Open Graph; sitemap and robots |
| Admin UI | Venues per organization, venue editor (status, profile, resources, facilities, photos) |
| Demo data | `pnpm --filter @jordan-sports/api seed:demo` — three clearly labelled demo venues, development only (refused in production); data in `apps/api/seeds/demo-venues.json` |

## How it was verified

| Check | Result |
|---|---|
| API integration tests | 50 passed (12 new: catalog, lifecycle and visibility, invalid transitions, approval rule, slugs, profile/location, combined resources overlap, attribute/format validation, default policy, inactive resources hidden, EXIF/GPS removal, non-image rejection, support read-only) |
| E2E | 54 passed (admin onboards a venue in the UI → public page in Arabic and English, directory filters, home sports, sitemap/robots, accessibility) |

## Not in M2 (by design / open)

- Map display and map-based location picking: waits for the map provider decision (coordinates are
  stored and published in JSON-LD).
- Production object storage (S3-compatible): waits for the hosting decision.
- Venue staff editing their own venue profile in `/manage` (pilot: admins do it); staff scheduling
  tools arrive in M3.
- Per-venue scoping of staff memberships (organization-wide for now).
- Online booking: M5 (pages state that booking is not available yet).
