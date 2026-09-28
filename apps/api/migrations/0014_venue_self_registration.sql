-- 0014: venue self-registration (plan §3). Owners fill these in during the wizard; none of them
-- gate anything yet (CliQ payment processing is P4) — they are just stored configuration.
ALTER TABLE venue.venues
  ADD COLUMN cliq_alias text CHECK (cliq_alias IS NULL OR char_length(cliq_alias) BETWEEN 1 AND 60),
  ADD COLUMN cliq_alias_holder text
    CHECK (cliq_alias_holder IS NULL OR char_length(cliq_alias_holder) BETWEEN 1 AND 120),
  ADD COLUMN deposit_percentage smallint
    CHECK (deposit_percentage IS NULL OR deposit_percentage BETWEEN 0 AND 100),
  ADD COLUMN whatsapp_phone text CHECK (whatsapp_phone IS NULL OR whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$'),
  -- Set on any admin status change (most useful for 'rejected': why, so the owner can fix it).
  ADD COLUMN status_reason text;
