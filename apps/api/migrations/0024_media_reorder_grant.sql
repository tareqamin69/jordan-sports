-- 0024: venue owners can reorder photos (the first photo is the cover): only the order may change.
GRANT UPDATE (sort_order) ON venue.media TO js_app;
