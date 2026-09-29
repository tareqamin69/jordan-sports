-- 0025: a tiny blurred preview per photo (a WebP data URL, well under 1 KB), shown while the real
-- image loads (blur-up). Resized copies (320/640/960/1600 px) are created on demand next to the
-- original in media storage.
ALTER TABLE venue.media
  ADD COLUMN blur text CHECK (blur IS NULL OR (blur LIKE 'data:image/webp;base64,%' AND char_length(blur) <= 2000));
GRANT UPDATE (blur) ON venue.media TO js_app;
