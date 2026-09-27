# 0016. Custom day/week resource calendar

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §P](../architecture.md#p-venue-dashboard)

## Context

The venue dashboard's core screen is a resource × time grid (day and week views) supporting RTL,
Arabic/English, venue time zones, business days that cross midnight, split/combined resources, and fast
"Block" / "Add booking" actions. Resource-timeline views in popular calendar libraries are often
commercially licensed (e.g. FullCalendar's resource views are part of its premium offering).

## Decision

Build a focused, custom day/week resource grid in `packages/ui`/`apps/web` with exactly the features
the dashboard needs, rendered from the same calendar query API the backend provides. Monthly view is
deferred.

## Consequences

- Full control over RTL, time-zone and business-day rendering, and no licence cost.
- We own the component's accessibility and interaction quality (keyboard navigation, screen readers).
- Advanced features (drag-to-resize, virtualization) are built only when needed.

## Alternatives considered

- **Licensed scheduler component:** faster start, licence cost, less control over RTL and business-day
  rules.
- **Generic open-source calendars without resource views:** would need heavy customization anyway.
