-- 0007: an icon key per sport for the marketplace UI (catalog data; the UI icon set is generic).
ALTER TABLE catalog.sports
  ADD COLUMN icon text NOT NULL DEFAULT 'ball-generic' CHECK (icon ~ '^[a-z]+(-[a-z]+)*$');

UPDATE catalog.sports SET icon = 'ball-kick' WHERE key = 'football';
UPDATE catalog.sports SET icon = 'racket-paddle' WHERE key = 'padel';
UPDATE catalog.sports SET icon = 'racket-string' WHERE key = 'tennis';
