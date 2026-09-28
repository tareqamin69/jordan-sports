-- 0013: two interfaces, one account (plan §2). `preferred_mode` records which interface a new
-- signup asked to land in ("بدك تحجز وتلعب؟" / "عندك ملعب وبدك تضيفه؟"). It is presentation
-- only — it grants nothing; venue access is still decided by organization membership
-- (ADR-0008) — and is set once at signup, never required for existing rows.
ALTER TABLE identity.users
  ADD COLUMN preferred_mode text NOT NULL DEFAULT 'player'
    CHECK (preferred_mode IN ('player', 'venue'));
