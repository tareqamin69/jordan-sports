-- 0017: platform staff account security (docs/rbac-plan.md §6): one-time setup links, lockout,
-- re-authentication for dangerous actions and known devices for sign-in alerts.

-- One-time links to set a password and enrol an authenticator: the owner's setup link (30 min,
-- created only from the server command line) and staff invitations (48 h, created by the owner).
-- Only the SHA-256 of the token is stored; the pending authenticator secret is encrypted.
CREATE TABLE identity.account_setup_tokens (
  id                     uuid        PRIMARY KEY,
  purpose                text        NOT NULL CHECK (purpose IN ('owner_setup', 'staff_invite')),
  email                  citext      NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  display_name           text        CHECK (char_length(display_name) BETWEEN 1 AND 80),
  platform_role          text        NOT NULL CHECK (platform_role IN ('owner', 'admin', 'support', 'finance')),
  -- Owner setup only: the current owner (if any) is demoted to admin when the link is used.
  replace_owner          boolean     NOT NULL DEFAULT false,
  token_hash             char(64)    NOT NULL UNIQUE,
  totp_secret_encrypted  text        NOT NULL,
  expires_at             timestamptz NOT NULL,
  used_at                timestamptz,
  revoked_at             timestamptz,
  created_by             uuid        REFERENCES identity.users (id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT setup_owner_role CHECK ((purpose = 'owner_setup') = (platform_role = 'owner'))
);
CREATE INDEX account_setup_tokens_email_idx ON identity.account_setup_tokens (email, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON identity.account_setup_tokens TO js_app;

-- Lockout after repeated failed staff sign-ins.
ALTER TABLE identity.users
  ADD COLUMN failed_sign_ins integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until    timestamptz;

-- Dangerous admin actions require a fresh password + authenticator check on the session.
ALTER TABLE identity.sessions ADD COLUMN reauthenticated_at timestamptz;

-- Browsers a staff member has signed in from (a long-lived random cookie, stored hashed): a
-- sign-in from an unknown device triggers an email alert.
CREATE TABLE identity.staff_devices (
  user_id       uuid        NOT NULL REFERENCES identity.users (id),
  device_hash   char(64)    NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  user_agent    text,
  PRIMARY KEY (user_id, device_hash)
);
GRANT SELECT, INSERT, UPDATE ON identity.staff_devices TO js_app;
