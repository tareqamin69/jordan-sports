-- 0022: whether a venue owner's edit of a published venue's name or photos sends it back to
-- review (platform setting, default off).
ALTER TABLE platform.settings
  ADD COLUMN venue_edits_need_review boolean NOT NULL DEFAULT false;
