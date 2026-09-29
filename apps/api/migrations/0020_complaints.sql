-- 0020: problem reports from players and venues, handled by the platform team
-- (docs/rbac-plan.md §7.4). Status: new → in_progress → resolved (can be reopened).
CREATE SCHEMA support;
GRANT USAGE ON SCHEMA support TO js_app;

CREATE TABLE support.complaints (
  id                uuid        PRIMARY KEY,
  reference         text        NOT NULL UNIQUE CHECK (reference ~ '^C-[A-Z0-9]{6}$'),
  reporter_user_id  uuid        NOT NULL REFERENCES identity.users (id),
  reporter_kind     text        NOT NULL CHECK (reporter_kind IN ('player', 'venue')),
  organization_id   uuid        REFERENCES tenancy.organizations (id),
  venue_id          uuid        REFERENCES venue.venues (id),
  booking_id        uuid        REFERENCES booking.bookings (id),
  category          text        NOT NULL CHECK (category IN (
                                  'booking', 'venue', 'payment', 'app', 'player_behaviour', 'other')),
  body              text        NOT NULL CHECK (char_length(body) BETWEEN 5 AND 4000),
  status            text        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
  assignee_id       uuid        REFERENCES identity.users (id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  CONSTRAINT complaints_venue_reporter CHECK (reporter_kind = 'player' OR venue_id IS NOT NULL)
);
CREATE INDEX complaints_queue_idx ON support.complaints (status, created_at DESC);
CREATE INDEX complaints_reporter_idx ON support.complaints (reporter_user_id, created_at DESC);
CREATE INDEX complaints_venue_idx ON support.complaints (venue_id, created_at DESC);
CREATE TRIGGER complaints_touch BEFORE UPDATE ON support.complaints
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Conversation on a complaint. Internal notes are seen by the platform team only.
CREATE TABLE support.complaint_messages (
  id              uuid        PRIMARY KEY,
  complaint_id    uuid        NOT NULL REFERENCES support.complaints (id),
  author_user_id  uuid        NOT NULL REFERENCES identity.users (id),
  author_kind     text        NOT NULL CHECK (author_kind IN ('reporter', 'staff')),
  body            text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  internal        boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT complaint_messages_internal_staff CHECK (NOT internal OR author_kind = 'staff')
);
CREATE INDEX complaint_messages_idx ON support.complaint_messages (complaint_id, created_at);
CREATE TRIGGER complaint_messages_append_only BEFORE UPDATE OR DELETE ON support.complaint_messages
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();

GRANT SELECT, INSERT, UPDATE ON support.complaints TO js_app;
GRANT SELECT, INSERT ON support.complaint_messages TO js_app;
