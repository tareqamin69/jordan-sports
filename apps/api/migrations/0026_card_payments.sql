-- 0026: card-only payments (ADR-0020). Players pay the full price by card (Visa/Mastercard) when
-- they book; Jorena is the merchant, keeps its commission and pays the rest out to the venue.
-- CliQ-to-venue deposits and the prepaid commission balance (0015) are retired: their tables and
-- columns stay for history, but nothing writes to them any more.

-- ---------------------------------------------------------------------------------------------
-- Bookings: card as the payment method; the commission rate is fixed when the slot is held.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE booking.bookings DROP CONSTRAINT bookings_payment_method_check;
ALTER TABLE booking.bookings
  ADD CONSTRAINT bookings_payment_method_check
  CHECK (payment_method IN ('PAY_AT_VENUE', 'CLIQ', 'CARD'));
ALTER TABLE booking.bookings
  ADD COLUMN commission_bps integer CHECK (commission_bps BETWEEN 0 AND 5000);

-- The venue's refund for a cancellation after the free window: none, half or all (the free window
-- itself always refunds in full, and a venue-side cancellation too).
ALTER TABLE venue.venues
  ADD COLUMN late_refund_percent integer NOT NULL DEFAULT 0
    CHECK (late_refund_percent IN (0, 50, 100));

-- ---------------------------------------------------------------------------------------------
-- Gateway transactions: every charge attempt and every refund, as the gateway reported it.
-- Card numbers never reach us (hosted checkout); only the brand and last four digits are kept.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE payment.transactions (
  id               uuid        PRIMARY KEY,
  booking_id       uuid        NOT NULL REFERENCES booking.bookings (id),
  organization_id  uuid        NOT NULL REFERENCES tenancy.organizations (id),
  venue_id         uuid        NOT NULL REFERENCES venue.venues (id),
  kind             text        NOT NULL CHECK (kind IN ('charge', 'refund')),
  gateway          text        NOT NULL CHECK (gateway ~ '^[a-z0-9_]{2,20}$'),
  -- Integer minor units (ADR-0006).
  amount           bigint      NOT NULL CHECK (amount > 0),
  currency         char(3)     NOT NULL,
  status           text        NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  -- The gateway's id: the checkout session of a charge, or the refund id.
  gateway_ref      text        CHECK (char_length(gateway_ref) <= 200),
  card_brand       text        CHECK (card_brand IN ('visa', 'mastercard')),
  card_last4       char(4)     CHECK (card_last4 ~ '^[0-9]{4}$'),
  failure_code     text        CHECK (char_length(failure_code) <= 60),
  -- Refunds: why (free window, late with the venue's percentage, venue, admin, paid too late).
  reason           text        CHECK (reason IN (
                     'customer_free', 'customer_late', 'venue', 'admin', 'expired'
                   )),
  attempts         integer     NOT NULL DEFAULT 0,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transactions_reason CHECK ((kind = 'refund') = (reason IS NOT NULL)),
  CONSTRAINT transactions_completed CHECK ((status = 'pending') = (completed_at IS NULL))
);
-- At most one live charge per booking (a failed attempt can be retried with a new one).
CREATE UNIQUE INDEX transactions_live_charge_idx ON payment.transactions (booking_id)
  WHERE kind = 'charge' AND status IN ('pending', 'succeeded');
-- A booking is refunded once (full or partial).
CREATE UNIQUE INDEX transactions_refund_idx ON payment.transactions (booking_id)
  WHERE kind = 'refund';
CREATE UNIQUE INDEX transactions_gateway_ref_idx ON payment.transactions (gateway, kind, gateway_ref)
  WHERE gateway_ref IS NOT NULL;
CREATE INDEX transactions_open_idx ON payment.transactions (created_at) WHERE status = 'pending';
CREATE INDEX transactions_recent_idx ON payment.transactions (created_at DESC);
CREATE TRIGGER transactions_touch BEFORE UPDATE ON payment.transactions
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
GRANT SELECT, INSERT, UPDATE ON payment.transactions TO js_app;

-- ---------------------------------------------------------------------------------------------
-- Payouts to venues (weekly). The organization's bank account (owner only), and each transfer
-- made with a snapshot of the bookings it paid for.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE finance.payout_accounts (
  organization_id  uuid        PRIMARY KEY REFERENCES tenancy.organizations (id),
  -- Jordanian IBAN: JO + 2 check digits + 4-letter bank code + 22 characters (checked in code too).
  iban             text        NOT NULL CHECK (iban ~ '^JO[0-9]{2}[A-Z]{4}[0-9A-Z]{22}$'),
  holder_name      text        NOT NULL CHECK (char_length(holder_name) BETWEEN 2 AND 120),
  bank_name        text        CHECK (char_length(bank_name) BETWEEN 2 AND 80),
  updated_by       uuid        REFERENCES identity.users (id),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE finance.payouts (
  id               uuid        PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES tenancy.organizations (id),
  venue_id         uuid        NOT NULL REFERENCES venue.venues (id),
  currency         char(3)     NOT NULL,
  gross            bigint      NOT NULL CHECK (gross >= 0),
  commission       bigint      NOT NULL CHECK (commission >= 0),
  net              bigint      NOT NULL CHECK (net >= 0),
  -- Bank transfer reference, and the account it went to (a snapshot).
  reference        text        NOT NULL CHECK (char_length(reference) BETWEEN 3 AND 80),
  iban             text        NOT NULL,
  paid_by          uuid        NOT NULL REFERENCES identity.users (id),
  paid_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payouts_net CHECK (net = gross - commission)
);
CREATE INDEX payouts_venue_idx ON finance.payouts (venue_id, paid_at DESC);

CREATE TABLE finance.payout_items (
  payout_id        uuid        NOT NULL REFERENCES finance.payouts (id),
  -- A booking is paid out once.
  booking_id       uuid        PRIMARY KEY REFERENCES booking.bookings (id),
  gross            bigint      NOT NULL,
  commission       bigint      NOT NULL,
  net              bigint      NOT NULL
);
CREATE INDEX payout_items_payout_idx ON finance.payout_items (payout_id);
CREATE TRIGGER payouts_append_only BEFORE UPDATE OR DELETE ON finance.payouts
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();
CREATE TRIGGER payout_items_append_only BEFORE UPDATE OR DELETE ON finance.payout_items
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();

-- Tenant-private (ADR-0008); admin screens bypass explicitly.
ALTER TABLE finance.payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.payout_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY payout_accounts_tenant ON finance.payout_accounts
  USING (
    organization_id = nullif(current_setting('app.org_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.org_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );
ALTER TABLE finance.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.payouts FORCE ROW LEVEL SECURITY;
CREATE POLICY payouts_tenant ON finance.payouts
  USING (
    organization_id = nullif(current_setting('app.org_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.org_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );

GRANT SELECT, INSERT, UPDATE ON finance.payout_accounts TO js_app;
GRANT SELECT, INSERT ON finance.payouts, finance.payout_items TO js_app;

-- The retired CliQ feature switch.
UPDATE platform.settings SET features = features - 'cliqPayments' WHERE features ? 'cliqPayments';
