-- 0028: consent records, marketing preference, account deletion and the company details shown
-- on legal pages and receipts (Jordan PDPL No. 24/2023; docs/compliance-checklist.md).

-- Accounts --------------------------------------------------------------------------------------
ALTER TABLE identity.users
  -- The legal-texts version accepted at sign-up (docs/legal), and when.
  ADD COLUMN terms_version     text,
  ADD COLUMN terms_accepted_at timestamptz,
  -- Separate, unticked-by-default opt-in for offers and news; null = not opted in.
  ADD COLUMN marketing_opt_in_at timestamptz,
  -- "Delete my account": the row stays (bookings and payments must keep a reference for
  -- accounting), but every personal detail is removed.
  ADD COLUMN deleted_at timestamptz;

ALTER TABLE identity.users DROP CONSTRAINT users_status_check;
ALTER TABLE identity.users
  ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'banned', 'deleted'));
ALTER TABLE identity.users DROP CONSTRAINT users_contact_required;
ALTER TABLE identity.users
  ADD CONSTRAINT users_contact_required
  CHECK (phone IS NOT NULL OR email IS NOT NULL OR deleted_at IS NOT NULL);
ALTER TABLE identity.users
  ADD CONSTRAINT users_deleted_scrubbed
  CHECK (deleted_at IS NULL OR (phone IS NULL AND email IS NULL AND display_name IS NULL));

-- Every consent given or withdrawn, append-only: what, which text version, when.
CREATE TABLE identity.consents (
  id          uuid        PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES identity.users (id),
  kind        text        NOT NULL CHECK (kind IN (
                'terms',              -- terms + privacy policy at sign-up
                'marketing_opt_in',
                'marketing_opt_out',
                'adult_payment'       -- "I am 18 or older" before paying by card
              )),
  version     text,
  booking_id  uuid        REFERENCES booking.bookings (id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consents_user_idx ON identity.consents (user_id, created_at);
CREATE TRIGGER consents_append_only BEFORE UPDATE OR DELETE ON identity.consents
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();
GRANT SELECT, INSERT ON identity.consents TO js_app;

-- Company details (legal pages, footer, receipts). Empty = not shown; never invented.
ALTER TABLE platform.settings
  ADD COLUMN company_name_ar         text CHECK (char_length(company_name_ar) BETWEEN 2 AND 160),
  ADD COLUMN company_name_en         text CHECK (char_length(company_name_en) BETWEEN 2 AND 160),
  ADD COLUMN company_registration_no text CHECK (char_length(company_registration_no) BETWEEN 2 AND 60),
  ADD COLUMN company_address_ar      text CHECK (char_length(company_address_ar) BETWEEN 2 AND 300),
  ADD COLUMN company_address_en      text CHECK (char_length(company_address_en) BETWEEN 2 AND 300);
