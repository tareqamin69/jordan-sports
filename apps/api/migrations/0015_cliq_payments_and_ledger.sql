-- 0015: CliQ payments straight to the venue, and the prepaid commission ledger
-- (docs/plans/jordan-wide-cliq-marketplace.md §4–§5, ADR-0005/0006/0008). The platform never holds
-- player money: players transfer the deposit to the venue's CliQ alias, the venue confirms receipt,
-- and the platform's commission is deducted from a balance the organization tops up in advance.

-- ---------------------------------------------------------------------------------------------
-- Venue payment settings.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE venue.venues
  -- Commission in basis points of the full booking price (800 = 8%, plan D3).
  ADD COLUMN commission_bps integer NOT NULL DEFAULT 800 CHECK (commission_bps BETWEEN 0 AND 5000),
  -- How long a CliQ hold waits for the player's transfer, and again for the venue's confirmation
  -- once proof is sent (plan §4 step 1 and D1).
  ADD COLUMN payment_hold_minutes integer NOT NULL DEFAULT 30
    CHECK (payment_hold_minutes BETWEEN 10 AND 120);

-- ---------------------------------------------------------------------------------------------
-- Bookings: CliQ as a payment method; a deposit-paid state between unpaid and paid.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE booking.bookings DROP CONSTRAINT bookings_payment_method_check;
ALTER TABLE booking.bookings
  ADD CONSTRAINT bookings_payment_method_check CHECK (payment_method IN ('PAY_AT_VENUE', 'CLIQ'));
ALTER TABLE booking.bookings DROP CONSTRAINT bookings_payment_status_check;
ALTER TABLE booking.bookings
  ADD CONSTRAINT bookings_payment_status_check CHECK (payment_status IN (
    'NOT_REQUIRED', 'UNPAID', 'DEPOSIT_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'
  ));

-- ---------------------------------------------------------------------------------------------
-- Payments (one per marketplace booking at a CliQ venue). Separate from booking status (ADR-0005).
-- ---------------------------------------------------------------------------------------------
CREATE SCHEMA payment;
GRANT USAGE ON SCHEMA payment TO js_app;

CREATE TABLE payment.payments (
  id               uuid        PRIMARY KEY,
  booking_id       uuid        NOT NULL UNIQUE REFERENCES booking.bookings (id),
  organization_id  uuid        NOT NULL REFERENCES tenancy.organizations (id),
  venue_id         uuid        NOT NULL REFERENCES venue.venues (id),
  provider         text        NOT NULL CHECK (provider IN ('CLIQ_MANUAL')),
  -- Amount due now (the deposit), integer minor units (ADR-0006).
  amount           bigint      NOT NULL CHECK (amount > 0),
  currency         char(3)     NOT NULL,
  status           text        NOT NULL CHECK (status IN (
                     'AWAITING_PROOF', 'SUBMITTED', 'CONFIRMED', 'EXPIRED', 'CANCELLED'
                   )),
  -- Where the player was told to send the money (a snapshot: the venue may change its alias).
  payee_alias      text        NOT NULL,
  payee_holder     text,
  -- The CliQ transaction reference as the player typed it, and a normalized key for uniqueness.
  reference        text        CHECK (char_length(reference) BETWEEN 4 AND 40),
  reference_key    text,
  submitted_at     timestamptz,
  confirmed_at     timestamptz,
  confirmed_by     uuid        REFERENCES identity.users (id),
  -- Last "not received" answer from the venue (cleared when the player sends new proof).
  rejected_at      timestamptz,
  rejected_by      uuid        REFERENCES identity.users (id),
  reject_reason    text        CHECK (char_length(reject_reason) <= 300),
  -- Deposit the venue owes back to the player (plan D2): DUE until the venue marks it refunded.
  refund_status    text        CHECK (refund_status IN ('DUE', 'REFUNDED')),
  refund_due_at    timestamptz,
  refunded_at      timestamptz,
  refunded_by      uuid        REFERENCES identity.users (id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_reference CHECK ((reference IS NULL) = (reference_key IS NULL)),
  CONSTRAINT payments_proof CHECK (status NOT IN ('SUBMITTED', 'CONFIRMED') OR reference IS NOT NULL),
  CONSTRAINT payments_refund CHECK (refund_status IS NULL OR status = 'CONFIRMED'),
  CONSTRAINT payments_refund_due CHECK ((refund_status IS NULL) = (refund_due_at IS NULL)),
  CONSTRAINT payments_refunded CHECK ((refund_status = 'REFUNDED') = (refunded_at IS NOT NULL))
);
-- One CliQ transfer can pay for one booking only (per organization): stops a receipt being reused.
CREATE UNIQUE INDEX payments_reference_idx ON payment.payments (organization_id, reference_key)
  WHERE reference_key IS NOT NULL;
CREATE INDEX payments_pending_idx ON payment.payments (venue_id, submitted_at) WHERE status = 'SUBMITTED';
CREATE INDEX payments_refund_due_idx ON payment.payments (organization_id, refund_due_at)
  WHERE refund_status = 'DUE';
CREATE TRIGGER payments_touch BEFORE UPDATE ON payment.payments
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Problem reports. The system opens one when a player sent proof but the venue never answered
-- (plan D1); player/venue-opened reports and the admin list come next.
CREATE TABLE payment.disputes (
  id               uuid        PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES tenancy.organizations (id),
  venue_id         uuid        NOT NULL REFERENCES venue.venues (id),
  booking_id       uuid        NOT NULL REFERENCES booking.bookings (id),
  payment_id       uuid        REFERENCES payment.payments (id),
  kind             text        NOT NULL CHECK (kind IN ('UNCONFIRMED_PAYMENT')),
  status           text        NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  opened_by_role   text        NOT NULL CHECK (opened_by_role IN ('customer', 'venue', 'system')),
  resolution       text        CHECK (char_length(resolution) <= 1000),
  resolved_at      timestamptz,
  resolved_by      uuid        REFERENCES identity.users (id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- The expiry sweep may run on several workers: one automatic dispute per payment.
CREATE UNIQUE INDEX disputes_system_idx ON payment.disputes (payment_id, kind)
  WHERE opened_by_role = 'system';
CREATE INDEX disputes_open_idx ON payment.disputes (created_at) WHERE status = 'OPEN';

GRANT SELECT, INSERT, UPDATE ON payment.payments, payment.disputes TO js_app;

-- ---------------------------------------------------------------------------------------------
-- Prepaid commission ledger (plan §5, ADR-0006). Append-only entries per organization; the
-- cached balance row is updated in the same transaction and always equals the sum of entries.
-- ---------------------------------------------------------------------------------------------
CREATE SCHEMA finance;
GRANT USAGE ON SCHEMA finance TO js_app;

CREATE TABLE finance.balances (
  organization_id  uuid        PRIMARY KEY REFERENCES tenancy.organizations (id),
  currency         char(3)     NOT NULL DEFAULT 'JOD',
  balance          bigint      NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE finance.balance_entries (
  id               uuid        PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES tenancy.organizations (id),
  kind             text        NOT NULL CHECK (kind IN (
                     'topup', 'commission', 'commission_reversal', 'adjustment'
                   )),
  amount           bigint      NOT NULL CHECK (amount <> 0),
  currency         char(3)     NOT NULL,
  balance_after    bigint      NOT NULL,
  booking_id       uuid        REFERENCES booking.bookings (id),
  reason           text        CHECK (char_length(reason) BETWEEN 1 AND 300),
  created_by       uuid        REFERENCES identity.users (id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT balance_entries_sign CHECK (
    (kind = 'topup' AND amount > 0) OR
    (kind = 'commission' AND amount < 0) OR
    (kind = 'commission_reversal' AND amount > 0) OR
    kind = 'adjustment'
  ),
  CONSTRAINT balance_entries_booking CHECK (
    (kind IN ('commission', 'commission_reversal')) = (booking_id IS NOT NULL)
  ),
  CONSTRAINT balance_entries_reason CHECK (kind <> 'adjustment' OR reason IS NOT NULL)
);
-- Commission is charged at most once per booking, and reversed at most once.
CREATE UNIQUE INDEX balance_entries_booking_idx ON finance.balance_entries (booking_id, kind)
  WHERE booking_id IS NOT NULL;
CREATE INDEX balance_entries_org_idx ON finance.balance_entries (organization_id, created_at DESC);
CREATE TRIGGER balance_entries_append_only BEFORE UPDATE OR DELETE ON finance.balance_entries
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();

-- Balances are tenant-private (ADR-0008); admin screens and system jobs bypass explicitly. Not
-- FORCEd on balances: the owner-run function below must read them for the public visibility check.
ALTER TABLE finance.balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY balances_tenant ON finance.balances
  USING (
    organization_id = nullif(current_setting('app.org_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.org_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );
ALTER TABLE finance.balance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.balance_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY balance_entries_tenant ON finance.balance_entries
  USING (
    organization_id = nullif(current_setting('app.org_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.org_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );

GRANT SELECT, INSERT, UPDATE ON finance.balances TO js_app;
GRANT SELECT, INSERT ON finance.balance_entries TO js_app;

-- Can this organization's CliQ venues take new online bookings (and appear in search)? Only a
-- yes/no leaves the function, never the balance: public search runs without a tenant (plan §5,
-- D2 escalation, D4). Rules: balance above zero, and no refund left unmarked for 48 hours.
CREATE FUNCTION finance.org_takes_online_bookings(org uuid, at timestamptz) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT coalesce((SELECT b.balance > 0 FROM finance.balances b WHERE b.organization_id = org), false)
     AND NOT EXISTS (
       SELECT 1 FROM payment.payments p
        WHERE p.organization_id = org
          AND p.refund_status = 'DUE'
          AND p.refund_due_at <= at - interval '48 hours'
     );
$$;
REVOKE ALL ON FUNCTION finance.org_takes_online_bookings(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.org_takes_online_bookings(uuid, timestamptz) TO js_app;
