-- 0002: application role, identity, tenancy and audit (M1).
--
-- The API connects with a login role and immediately switches to the non-login role `js_app`
-- (SET ROLE, see platform/database/database.ts). `js_app` only receives the privileges granted
-- below, so it cannot run DDL, cannot modify append-only tables, and is subject to row-level
-- security (ADR-0008).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'js_app') THEN
    CREATE ROLE js_app NOLOGIN;
  END IF;
END
$$;

-- Allow the login role that runs the API to SET ROLE js_app.
DO $$
BEGIN
  EXECUTE format('GRANT js_app TO %I', current_user);
END
$$;

-- Shared trigger function for append-only tables (defense in depth on top of grants).
CREATE SCHEMA platform;
GRANT USAGE ON SCHEMA platform TO js_app;

CREATE FUNCTION platform.reject_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on %.% is not allowed (append-only table)', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END
$$;

-- Keeps updated_at current on UPDATE.
CREATE FUNCTION platform.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- identity
-- ---------------------------------------------------------------------------------------------
CREATE SCHEMA identity;
GRANT USAGE ON SCHEMA identity TO js_app;

CREATE TABLE identity.users (
  id                uuid        PRIMARY KEY,
  phone             text        UNIQUE CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  email             citext      UNIQUE CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  display_name      text        CHECK (char_length(display_name) BETWEEN 1 AND 80),
  locale            text        NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar', 'en')),
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  platform_role     text        CHECK (platform_role IN ('super_admin', 'admin', 'support', 'finance')),
  age_confirmed_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_contact_required CHECK (phone IS NOT NULL OR email IS NOT NULL),
  -- Platform staff sign in with email + password + TOTP.
  CONSTRAINT users_platform_staff_email CHECK (platform_role IS NULL OR email IS NOT NULL)
);
CREATE TRIGGER users_touch BEFORE UPDATE ON identity.users
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE identity.password_credentials (
  user_id        uuid        PRIMARY KEY REFERENCES identity.users (id),
  password_hash  text        NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity.totp_credentials (
  user_id           uuid        PRIMARY KEY REFERENCES identity.users (id),
  -- AES-256-GCM encrypted base32 secret (key derived from AUTH_SECRET).
  secret_encrypted  text        NOT NULL,
  -- Highest time step accepted so far; codes are single-use (replay protection).
  last_used_step    bigint      NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity.sessions (
  id            uuid        PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES identity.users (id),
  kind          text        NOT NULL CHECK (kind IN ('web', 'admin')),
  -- SHA-256 of the opaque token; the token itself is never stored.
  token_hash    char(64)    NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  ip            inet,
  user_agent    text
);
CREATE INDEX sessions_user_idx ON identity.sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE identity.otp_challenges (
  id                   uuid        PRIMARY KEY,
  phone                text        NOT NULL,
  -- HMAC-SHA256 of the code keyed with AUTH_SECRET.
  code_hash            char(64)    NOT NULL,
  attempts             integer     NOT NULL DEFAULT 0,
  expires_at           timestamptz NOT NULL,
  verified_at          timestamptz,
  -- For new users: SHA-256 of a one-time sign-up token issued after the code is verified.
  signup_token_hash    char(64)    UNIQUE,
  signup_completed_at  timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_challenges_phone_idx ON identity.otp_challenges (phone, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON
  identity.users, identity.password_credentials, identity.totp_credentials,
  identity.sessions, identity.otp_challenges
TO js_app;

-- ---------------------------------------------------------------------------------------------
-- tenancy
-- ---------------------------------------------------------------------------------------------
CREATE SCHEMA tenancy;
GRANT USAGE ON SCHEMA tenancy TO js_app;

CREATE TABLE tenancy.organizations (
  id          uuid        PRIMARY KEY,
  slug        text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 60),
  -- Localized name {"ar": "...", "en": "..."}; at least one supported locale.
  name        jsonb       NOT NULL CHECK (
                jsonb_typeof(name) = 'object' AND (name ? 'ar' OR name ? 'en')
              ),
  status      text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER organizations_touch BEFORE UPDATE ON tenancy.organizations
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE tenancy.memberships (
  id               uuid        PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES tenancy.organizations (id),
  user_id          uuid        NOT NULL REFERENCES identity.users (id),
  role             text        NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX memberships_user_idx ON tenancy.memberships (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.organizations, tenancy.memberships TO js_app;

-- ---------------------------------------------------------------------------------------------
-- audit (append-only)
-- ---------------------------------------------------------------------------------------------
CREATE SCHEMA audit;
GRANT USAGE ON SCHEMA audit TO js_app;

CREATE TABLE audit.audit_logs (
  id               uuid        PRIMARY KEY,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  actor_type       text        NOT NULL CHECK (actor_type IN ('user', 'admin', 'system')),
  actor_user_id    uuid        REFERENCES identity.users (id),
  action           text        NOT NULL CHECK (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  target_type      text,
  target_id        text,
  organization_id  uuid        REFERENCES tenancy.organizations (id),
  reason           text,
  -- Redacted details; never contains secrets or OTP codes.
  details          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip               inet,
  user_agent       text,
  request_id       text
);
CREATE INDEX audit_logs_occurred_idx ON audit.audit_logs (occurred_at DESC);
CREATE INDEX audit_logs_org_idx ON audit.audit_logs (organization_id, occurred_at DESC);
CREATE INDEX audit_logs_target_idx ON audit.audit_logs (target_type, target_id);

CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit.audit_logs
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();

GRANT SELECT, INSERT ON audit.audit_logs TO js_app;

-- Readiness checks run as js_app and read the migration history.
GRANT SELECT ON public.schema_migrations TO js_app;
