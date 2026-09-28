-- 0012: futsal shared football's exact icon ('ball-kick'), making the two indistinguishable in
-- the sport tiles/lists. Give futsal its own icon (a mini goal frame — the UI's icon set already
-- has 'goal-net' as of this change).
UPDATE catalog.sports SET icon = 'goal-net' WHERE key = 'futsal';
