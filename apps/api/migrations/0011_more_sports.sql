-- 0011: 3 more sports the owner asked for that weren't in the catalog yet (beach volleyball,
-- futsal/indoor football, running track). Same pattern as 0008b: sport + format + resource type,
-- all data (docs/architecture.md §E — no sport literals in application code).

INSERT INTO catalog.sports (key, name, icon, sort_order) VALUES
  ('beach_volleyball', '{"ar": "الكرة الطائرة الشاطئية", "en": "Beach volleyball"}'::jsonb, 'ball-beach', 15),
  ('futsal', '{"ar": "كرة القدم الصالات", "en": "Futsal / indoor football"}'::jsonb, 'ball-kick', 16),
  ('running_track', '{"ar": "مضمار الجري", "en": "Running track"}'::jsonb, 'track-oval', 17);

INSERT INTO catalog.sport_formats (sport_id, key, name, min_players, max_players, default_duration_minutes, sort_order)
SELECT s.id, f.key, f.name::jsonb, f.min_players, f.max_players, f.duration, f.sort_order
FROM (VALUES
  ('beach_volleyball', 'four_a_side', '{"ar": "رباعي شاطئي", "en": "4-a-side (sand)"}', 6, 8, 60, 1),
  ('futsal', 'five_a_side', '{"ar": "خماسي صالات", "en": "Futsal (5v5)"}', 8, 12, 60, 1),
  ('running_track', 'lane_session', '{"ar": "حصة مضمار", "en": "Track session"}', 1, 12, 60, 1)
) AS f(sport, key, name, min_players, max_players, duration, sort_order)
JOIN catalog.sports s ON s.key = f.sport;

INSERT INTO catalog.resource_types (key, name, attribute_schema, sort_order) VALUES
  ('beach_volleyball_court', '{"ar": "ملعب طائرة شاطئية", "en": "Beach volleyball court"}', '{"fields": [{"key": "lighting", "type": "boolean", "label": {"ar": "إنارة ليلية", "en": "Floodlights"}}, {"key": "showers", "type": "boolean", "label": {"ar": "دشات", "en": "Showers"}}]}', 15),
  ('futsal_pitch', '{"ar": "ملعب كرة قدم صالات", "en": "Futsal pitch"}', '{"fields": [{"key": "surface", "type": "enum", "label": {"ar": "الأرضية", "en": "Surface"}, "options": [{"value": "synthetic", "label": {"ar": "أرضية صناعية", "en": "Synthetic"}}, {"value": "hardwood", "label": {"ar": "باركيه", "en": "Hardwood"}}, {"value": "rubber", "label": {"ar": "مطاطية", "en": "Rubber"}}]}, {"key": "indoor", "type": "boolean", "label": {"ar": "داخلي (مغطّى)", "en": "Indoor"}}, {"key": "lighting", "type": "boolean", "label": {"ar": "إنارة ليلية", "en": "Floodlights"}}]}', 16),
  ('running_lane', '{"ar": "مضمار جري", "en": "Running track"}', '{"fields": [{"key": "surface", "type": "enum", "label": {"ar": "الأرضية", "en": "Surface"}, "options": [{"value": "rubber", "label": {"ar": "مطاطية", "en": "Rubber"}}, {"value": "synthetic", "label": {"ar": "صناعية", "en": "Synthetic"}}]}, {"key": "indoor", "type": "boolean", "label": {"ar": "داخلي (مغطّى)", "en": "Indoor"}}, {"key": "lighting", "type": "boolean", "label": {"ar": "إنارة ليلية", "en": "Floodlights"}}]}', 17);

INSERT INTO catalog.resource_type_formats (resource_type_id, sport_format_id)
SELECT rt.id, f.id
FROM (VALUES
  ('beach_volleyball_court', 'beach_volleyball', 'four_a_side'),
  ('futsal_pitch', 'futsal', 'five_a_side'),
  ('running_lane', 'running_track', 'lane_session')
) AS m(type_key, sport_key, format_key)
JOIN catalog.resource_types rt ON rt.key = m.type_key
JOIN catalog.sports s ON s.key = m.sport_key
JOIN catalog.sport_formats f ON f.sport_id = s.id AND f.key = m.format_key;
