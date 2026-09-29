-- 0019: the owner's private rating and notes per venue (docs/rbac-plan.md §7.3). Never shown to
-- players, venues or other staff; enforced by the API (venues.rate is owner only). Append-only:
-- the latest entry is the current rating, earlier ones are the history.
CREATE TABLE platform.venue_ratings (
  id          uuid        PRIMARY KEY,
  venue_id    uuid        NOT NULL REFERENCES venue.venues (id),
  score       smallint    NOT NULL CHECK (score BETWEEN 1 AND 5),
  tags        text[]      NOT NULL DEFAULT '{}',
  note        text        CHECK (char_length(note) <= 2000),
  created_by  uuid        NOT NULL REFERENCES identity.users (id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX venue_ratings_venue_idx ON platform.venue_ratings (venue_id, created_at DESC);
CREATE TRIGGER venue_ratings_append_only BEFORE UPDATE OR DELETE ON platform.venue_ratings
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();
GRANT SELECT, INSERT ON platform.venue_ratings TO js_app;
