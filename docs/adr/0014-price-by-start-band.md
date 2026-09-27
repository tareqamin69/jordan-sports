# 0014. Price a slot by the band in which it starts

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §H](../architecture.md#h-availability-engine-time-and-pricing)

## Context

Venues price by bands (e.g. off-peak until 17:00, peak after). A slot can cross a band boundary (e.g.
16:30–18:00). We need a rule that is deterministic, easy for venues and players to understand, and
simple to audit.

## Decision

A slot's price is the price defined for its duration in the **band that contains the slot's start
time** (in venue-local time, respecting the business-day rule). The applied band and rule version are
stored in the booking's price snapshot.

## Consequences

- Prices are predictable and match what venues typically quote.
- A slot starting just before peak is charged the off-peak price; venues can avoid this by aligning
  band boundaries with slot start times, and the price preview makes it visible.

## Alternatives considered

- **Prorate by minute across bands:** fairer in theory, but produces odd amounts and is harder to explain.
- **Highest band touched:** protects venue revenue but surprises players.
