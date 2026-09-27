-- 0004: scheduling — opening hours, date overrides, public holidays, blocked time and the
-- occupancy table that makes double booking impossible (ADR-0004, M3).

CREATE SCHEMA scheduling;
GRANT USAGE ON SCHEMA scheduling TO js_app;

-- Weekly opening windows per resource, in venue-local wall-clock time. A window belongs to the
-- calendar day on which it starts and may run past midnight (e.g. Thursday 16:00 for 600 minutes).
CREATE TABLE scheduling.weekly_hours (
  id                uuid        PRIMARY KEY,
  resource_id       uuid        NOT NULL REFERENCES resource.resources (id),
  -- ISO weekday: 1 = Monday … 7 = Sunday.
  day_of_week       smallint    NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_minute      integer     NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  duration_minutes  integer     NOT NULL CHECK (duration_minutes BETWEEN 15 AND 1440),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX weekly_hours_resource_idx ON scheduling.weekly_hours (resource_id);

-- Dated exceptions: closures or special hours (e.g. Ramadan) for a venue or one resource.
CREATE TABLE scheduling.date_overrides (
  id           uuid        PRIMARY KEY,
  venue_id     uuid        NOT NULL REFERENCES venue.venues (id),
  resource_id  uuid        REFERENCES resource.resources (id),
  date_from    date        NOT NULL,
  date_to      date        NOT NULL,
  kind         text        NOT NULL CHECK (kind IN ('closed', 'hours')),
  -- For kind = 'hours': [{"startMinute": int, "durationMinutes": int}, …] replacing weekly hours.
  windows      jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(windows) = 'array'),
  note         text        CHECK (char_length(note) <= 300),
  created_by   uuid        REFERENCES identity.users (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from AND date_to - date_from <= 366),
  CHECK (kind = 'hours' OR windows = '[]'::jsonb)
);
CREATE INDEX date_overrides_venue_idx ON scheduling.date_overrides (venue_id, date_from, date_to);

-- Public holidays per country, maintained by platform admins (no hard-coded dates).
CREATE TABLE scheduling.holidays (
  id            uuid    PRIMARY KEY,
  country_code  char(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  date          date    NOT NULL,
  name          jsonb   NOT NULL CHECK (platform.is_localized_text(name)),
  UNIQUE (country_code, date)
);

ALTER TABLE venue.venues ADD COLUMN closed_on_public_holidays boolean NOT NULL DEFAULT false;

-- Blocked time entered by venue staff: maintenance, closures, private events, bookings taken by
-- phone or in person outside the platform.
CREATE TABLE scheduling.blocks (
  id            uuid        PRIMARY KEY,
  venue_id      uuid        NOT NULL REFERENCES venue.venues (id),
  resource_id   uuid        NOT NULL REFERENCES resource.resources (id),
  during        tstzrange   NOT NULL CHECK (NOT isempty(during) AND lower_inc(during) AND NOT upper_inc(during)),
  reason        text        NOT NULL CHECK (reason IN ('maintenance', 'closure', 'private_event', 'external_booking', 'other')),
  note          text        CHECK (char_length(note) <= 300),
  created_by    uuid        REFERENCES identity.users (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  cancelled_at  timestamptz,
  cancelled_by  uuid        REFERENCES identity.users (id)
);
CREATE INDEX blocks_venue_idx ON scheduling.blocks USING gist (venue_id, during) WHERE cancelled_at IS NULL;

-- Every consumption of time on an atomic unit. The exclusion constraint is the double-booking
-- guarantee: two ACTIVE rows can never overlap on the same unit, whatever the application does.
CREATE TABLE scheduling.occupancies (
  id          uuid        PRIMARY KEY,
  venue_id    uuid        NOT NULL REFERENCES venue.venues (id),
  unit_id     uuid        NOT NULL REFERENCES resource.units (id),
  during      tstzrange   NOT NULL CHECK (NOT isempty(during) AND lower_inc(during) AND NOT upper_inc(during)),
  kind        text        NOT NULL CHECK (kind IN ('hold', 'booking', 'block')),
  active      boolean     NOT NULL DEFAULT true,
  expires_at  timestamptz,
  block_id    uuid        REFERENCES scheduling.blocks (id),
  -- Foreign key to booking.bookings is added with the bookings table (M5).
  booking_id  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT occupancies_hold_expiry CHECK ((kind = 'hold') = (expires_at IS NOT NULL)),
  CONSTRAINT occupancies_block_ref CHECK ((kind = 'block') = (block_id IS NOT NULL)),
  CONSTRAINT occupancies_booking_ref CHECK ((kind = 'block') OR booking_id IS NOT NULL),
  CONSTRAINT occupancies_no_overlap EXCLUDE USING gist (unit_id WITH =, during WITH &&) WHERE (active)
);
CREATE INDEX occupancies_venue_during_idx ON scheduling.occupancies USING gist (venue_id, during) WHERE active;
CREATE INDEX occupancies_active_holds_idx ON scheduling.occupancies (expires_at) WHERE active AND kind = 'hold';
CREATE INDEX occupancies_block_idx ON scheduling.occupancies (block_id) WHERE block_id IS NOT NULL;
CREATE INDEX occupancies_booking_idx ON scheduling.occupancies (booking_id) WHERE booking_id IS NOT NULL;

GRANT SELECT, INSERT, DELETE ON scheduling.weekly_hours, scheduling.date_overrides TO js_app;
GRANT SELECT, INSERT, DELETE ON scheduling.holidays TO js_app;
GRANT SELECT, INSERT, UPDATE ON scheduling.blocks, scheduling.occupancies TO js_app;
