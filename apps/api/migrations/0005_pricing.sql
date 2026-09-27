-- 0005: pricing rules (M4, docs/architecture.md §H, ADR-0014).
--
-- A rule prices slots that START inside its band. Bands are expressed on the venue's BUSINESS day:
-- `days_of_week` are ISO weekdays of the business date and minutes count from local midnight of
-- that date (values ≥ 1440 are after midnight, e.g. Thursday 22:00–02:00 = 1320–1560).
-- Rules are never edited in place: a change archives the rule and creates a new one, so the rule
-- id stored in a booking's price snapshot always describes the price that was quoted.

CREATE SCHEMA pricing;
GRANT USAGE ON SCHEMA pricing TO js_app;

CREATE TABLE pricing.price_rules (
  id            uuid        PRIMARY KEY,
  venue_id      uuid        NOT NULL REFERENCES venue.venues (id),
  resource_id   uuid        NOT NULL REFERENCES resource.resources (id),
  days_of_week  smallint[]  NOT NULL CHECK (
                  cardinality(days_of_week) BETWEEN 1 AND 7 AND 1 <= ALL (days_of_week) AND 7 >= ALL (days_of_week)
                ),
  start_minute  integer     NOT NULL CHECK (start_minute BETWEEN 0 AND 2879),
  end_minute    integer     NOT NULL CHECK (end_minute BETWEEN 1 AND 2880),
  -- Special periods (e.g. Ramadan, holidays) have dates and take precedence over regular bands.
  date_from     date,
  date_to       date,
  priority      integer     NOT NULL DEFAULT 0 CHECK (priority BETWEEN -100 AND 100),
  currency      char(3)     NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  label         text        CHECK (char_length(label) <= 80),
  created_by    uuid        REFERENCES identity.users (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz,
  CHECK (end_minute > start_minute AND end_minute - start_minute <= 1440),
  CHECK ((date_from IS NULL) = (date_to IS NULL) AND (date_to IS NULL OR date_to >= date_from))
);
CREATE INDEX price_rules_resource_idx ON pricing.price_rules (resource_id) WHERE archived_at IS NULL;

-- Price per allowed booking length, in minor units (fils for JOD).
CREATE TABLE pricing.price_rule_amounts (
  rule_id           uuid    NOT NULL REFERENCES pricing.price_rules (id),
  duration_minutes  integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 600),
  amount            bigint  NOT NULL CHECK (amount >= 0 AND amount <= 100000000),
  PRIMARY KEY (rule_id, duration_minutes)
);

GRANT SELECT, INSERT ON pricing.price_rules, pricing.price_rule_amounts TO js_app;
GRANT UPDATE (archived_at) ON pricing.price_rules TO js_app;
