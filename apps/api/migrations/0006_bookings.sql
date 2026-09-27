-- 0006: bookings, venue customers (row-level security), recurring series, idempotency keys,
-- transactional outbox and notification deliveries (M5, docs/architecture.md §G, ADR-0004/0005/0007/0008).

-- Cancellation window shown to players; later cancellations are allowed but recorded as late
-- (a reliability signal, no penalty — pay-at-venue MVP).
ALTER TABLE venue.venues
  ADD COLUMN cancellation_cutoff_hours integer NOT NULL DEFAULT 24 CHECK (cancellation_cutoff_hours BETWEEN 0 AND 168);

CREATE SCHEMA booking;
GRANT USAGE ON SCHEMA booking TO js_app;

-- ---------------------------------------------------------------------------------------------
-- Venue customers: people who book by phone or in person. Private to the organization (tenant):
-- protected by row-level security in addition to application checks (ADR-0008).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE booking.venue_customers (
  id               uuid        PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES tenancy.organizations (id),
  name             text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  phone            text        CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX venue_customers_phone_idx ON booking.venue_customers (organization_id, phone) WHERE phone IS NOT NULL;

ALTER TABLE booking.venue_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking.venue_customers FORCE ROW LEVEL SECURITY;
CREATE POLICY venue_customers_tenant ON booking.venue_customers
  USING (
    organization_id = nullif(current_setting('app.org_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.org_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );

-- ---------------------------------------------------------------------------------------------
-- Recurring series (venue-side weekly bookings).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE booking.series (
  id                uuid        PRIMARY KEY,
  venue_id          uuid        NOT NULL REFERENCES venue.venues (id),
  resource_id       uuid        NOT NULL REFERENCES resource.resources (id),
  venue_customer_id uuid        NOT NULL REFERENCES booking.venue_customers (id),
  first_date        date        NOT NULL,
  start_time        time        NOT NULL,
  duration_minutes  integer     NOT NULL CHECK (duration_minutes BETWEEN 15 AND 600),
  weeks             integer     NOT NULL CHECK (weeks BETWEEN 1 AND 52),
  created_by        uuid        REFERENCES identity.users (id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------------------------
-- Bookings (ADR-0005: lifecycle status, payment status and attendance are separate).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE booking.bookings (
  id                    uuid        PRIMARY KEY,
  -- Short human-friendly reference shown to players and venues.
  reference             text        NOT NULL UNIQUE CHECK (reference ~ '^[A-Z0-9]{8}$'),
  venue_id              uuid        NOT NULL REFERENCES venue.venues (id),
  organization_id       uuid        NOT NULL REFERENCES tenancy.organizations (id),
  resource_id           uuid        NOT NULL REFERENCES resource.resources (id),
  channel               text        NOT NULL CHECK (channel IN ('MARKETPLACE', 'VENUE_MANUAL')),
  customer_user_id      uuid        REFERENCES identity.users (id),
  venue_customer_id     uuid        REFERENCES booking.venue_customers (id),
  series_id             uuid        REFERENCES booking.series (id),
  status                text        NOT NULL CHECK (status IN ('HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'NO_SHOW')),
  payment_status        text        NOT NULL CHECK (payment_status IN ('NOT_REQUIRED', 'UNPAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  payment_method        text        CHECK (payment_method IN ('PAY_AT_VENUE')),
  during                tstzrange   NOT NULL CHECK (NOT isempty(during) AND lower_inc(during) AND NOT upper_inc(during)),
  business_date         date        NOT NULL,
  time_zone             text        NOT NULL,
  currency              char(3)     NOT NULL,
  -- Money in minor units (ADR-0006). NULL total: manual booking without a configured price.
  subtotal              bigint      CHECK (subtotal >= 0),
  total                 bigint      CHECK (total >= 0),
  price_snapshot        jsonb,
  cancellation_policy   jsonb       NOT NULL,
  note                  text        CHECK (char_length(note) <= 300),
  hold_expires_at       timestamptz,
  confirmed_at          timestamptz,
  cancelled_at          timestamptz,
  cancelled_by          uuid        REFERENCES identity.users (id),
  cancelled_by_role     text        CHECK (cancelled_by_role IN ('customer', 'venue', 'admin', 'system')),
  cancel_reason         text        CHECK (char_length(cancel_reason) <= 300),
  late_cancellation     boolean,
  checked_in_at         timestamptz,
  checked_in_by         uuid        REFERENCES identity.users (id),
  created_by            uuid        REFERENCES identity.users (id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_customer CHECK (
    (channel = 'MARKETPLACE' AND customer_user_id IS NOT NULL) OR
    (channel = 'VENUE_MANUAL' AND venue_customer_id IS NOT NULL)
  ),
  CONSTRAINT bookings_hold CHECK ((status = 'HELD') = (hold_expires_at IS NOT NULL)),
  CONSTRAINT bookings_total CHECK (total IS NULL OR total = subtotal)
);
CREATE INDEX bookings_customer_idx ON booking.bookings (customer_user_id, lower(during)) WHERE customer_user_id IS NOT NULL;
CREATE INDEX bookings_venue_idx ON booking.bookings (venue_id, lower(during));
CREATE INDEX bookings_held_idx ON booking.bookings (hold_expires_at) WHERE status = 'HELD';
CREATE INDEX bookings_confirmed_end_idx ON booking.bookings (upper(during)) WHERE status = 'CONFIRMED';
CREATE TRIGGER bookings_touch BEFORE UPDATE ON booking.bookings
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- One row per booked resource (MVP: exactly one); room for multi-item bookings later.
CREATE TABLE booking.booking_items (
  id           uuid      PRIMARY KEY,
  booking_id   uuid      NOT NULL REFERENCES booking.bookings (id),
  resource_id  uuid      NOT NULL REFERENCES resource.resources (id),
  during       tstzrange NOT NULL,
  amount       bigint    CHECK (amount >= 0)
);
CREATE INDEX booking_items_booking_idx ON booking.booking_items (booking_id);

-- Append-only lifecycle history.
CREATE TABLE booking.status_history (
  id           uuid        PRIMARY KEY,
  booking_id   uuid        NOT NULL REFERENCES booking.bookings (id),
  from_status  text,
  to_status    text        NOT NULL,
  actor_type   text        NOT NULL CHECK (actor_type IN ('customer', 'venue', 'admin', 'system')),
  actor_user_id uuid       REFERENCES identity.users (id),
  reason       text,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX status_history_booking_idx ON booking.status_history (booking_id, occurred_at);
CREATE TRIGGER status_history_append_only BEFORE UPDATE OR DELETE ON booking.status_history
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();

ALTER TABLE scheduling.occupancies
  ADD CONSTRAINT occupancies_booking_fk FOREIGN KEY (booking_id) REFERENCES booking.bookings (id);

GRANT SELECT, INSERT, UPDATE ON booking.venue_customers, booking.series, booking.bookings TO js_app;
GRANT SELECT, INSERT ON booking.booking_items, booking.status_history TO js_app;

-- ---------------------------------------------------------------------------------------------
-- Idempotency keys for booking requests (docs/architecture.md §N).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE platform.idempotency_keys (
  user_id          uuid        NOT NULL REFERENCES identity.users (id),
  key              text        NOT NULL CHECK (char_length(key) BETWEEN 8 AND 100),
  request_hash     char(64)    NOT NULL,
  status           text        NOT NULL CHECK (status IN ('in_progress', 'completed')),
  response_status  integer,
  response_body    jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.idempotency_keys TO js_app;

-- ---------------------------------------------------------------------------------------------
-- Transactional outbox (ADR-0007): written in the same transaction as the state change, dispatched
-- by the worker with at-least-once delivery.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE platform.outbox_events (
  id               uuid        PRIMARY KEY,
  type             text        NOT NULL CHECK (type ~ '^[a-z_]+(\.[a-z_]+)+$'),
  payload          jsonb       NOT NULL,
  attempts         integer     NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending_idx ON platform.outbox_events (next_attempt_at) WHERE processed_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON platform.outbox_events TO js_app;

-- ---------------------------------------------------------------------------------------------
-- Notification deliveries (what was sent, through which channel). Message text is stored for
-- support; never secrets or codes (OTP codes do not go through this table).
-- ---------------------------------------------------------------------------------------------
CREATE SCHEMA notification;
GRANT USAGE ON SCHEMA notification TO js_app;

CREATE TABLE notification.deliveries (
  id            uuid        PRIMARY KEY,
  event_id      uuid        NOT NULL REFERENCES platform.outbox_events (id),
  channel       text        NOT NULL CHECK (channel IN ('console', 'sms', 'whatsapp', 'email')),
  recipient     text        NOT NULL,
  template      text        NOT NULL,
  locale        text        NOT NULL CHECK (locale IN ('ar', 'en')),
  body          text        NOT NULL,
  status        text        NOT NULL CHECK (status IN ('sent', 'failed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, recipient, template)
);
GRANT SELECT, INSERT ON notification.deliveries TO js_app;
