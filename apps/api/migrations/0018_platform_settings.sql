-- 0018: platform settings managed by the owner from the admin panel (docs/rbac-plan.md §7), all
-- changes audited with before/after values. One row.
CREATE TABLE platform.settings (
  id                  boolean     PRIMARY KEY DEFAULT true CHECK (id),
  -- Default commission on online bookings, in basis points (800 = 8%). Venues may override.
  commission_bps      integer     NOT NULL DEFAULT 800 CHECK (commission_bps BETWEEN 0 AND 5000),
  -- Platform support WhatsApp number shown to players and venues (E.164), optional.
  support_whatsapp    text        CHECK (support_whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  -- Feature flags; a missing or null flag falls back to the server environment default.
  features            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- When not empty, the admin panel only accepts requests from these addresses / CIDR ranges.
  admin_ip_allowlist  text[]      NOT NULL DEFAULT '{}',
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid        REFERENCES identity.users (id)
);
INSERT INTO platform.settings (id) VALUES (true);
GRANT SELECT, UPDATE ON platform.settings TO js_app;

-- A venue's commission is now an optional override of the platform default. Venues that still
-- carry the old column default follow the platform setting from now on.
ALTER TABLE venue.venues ALTER COLUMN commission_bps DROP NOT NULL;
ALTER TABLE venue.venues ALTER COLUMN commission_bps DROP DEFAULT;
UPDATE venue.venues SET commission_bps = NULL WHERE commission_bps = 800;
