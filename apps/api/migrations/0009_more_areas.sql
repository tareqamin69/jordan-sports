-- 0009: more areas per governorate, closer to the full set of official districts/towns
-- (docs/plans/jordan-wide-cliq-marketplace.md §1). Existing rows are untouched; this only adds
-- more choices under each governorate for search/filter and venue registration.

INSERT INTO catalog.areas (city_id, key, name, sort_order)
SELECT c.id, a.key, a.name::jsonb, a.sort_order FROM (VALUES
  ('amman', 'wadi_seer',   '{"ar": "وادي السير", "en": "Wadi As-Seer"}', 21),
  ('amman', 'quwaismeh',   '{"ar": "القويسمة", "en": "Al-Quwaismeh"}', 22),
  ('amman', 'jizah',       '{"ar": "الجيزة", "en": "Al-Jizah"}', 23),
  ('amman', 'muwaqqar',    '{"ar": "الموقر", "en": "Al-Muwaqqar"}', 24),
  ('amman', 'shafa_badran','{"ar": "شفا بدران", "en": "Shafa Badran"}', 25),

  ('irbid', 'bani_obeid', '{"ar": "بني عبيد", "en": "Bani Obeid"}', 10),
  ('irbid', 'wasatiyah',  '{"ar": "الوسطية", "en": "Al-Wasatiyah"}', 11),
  ('irbid', 'sal',        '{"ar": "صال", "en": "Sal"}', 12),
  ('irbid', 'aydoun',     '{"ar": "عيدون", "en": "Aydoun"}', 13),
  ('irbid', 'beit_ras',   '{"ar": "بيت راس", "en": "Beit Ras"}', 14),

  ('balqa', 'al_karamah', '{"ar": "الكرامة", "en": "Al-Karamah"}', 7),

  ('madaba', 'faysaliyah', '{"ar": "الفيصلية", "en": "Al-Faysaliyah"}', 4),
  ('madaba', 'hisban',     '{"ar": "حسبان", "en": "Hisban"}', 5),
  ('madaba', 'maein',      '{"ar": "ماعين", "en": "Ma''in"}', 6),

  ('jerash', 'burma', '{"ar": "برما", "en": "Burma"}', 4),
  ('jerash', 'sakib',  '{"ar": "ساكب", "en": "Sakib"}', 5),

  ('ajloun', 'ain_jenna', '{"ar": "عين جنا", "en": "Ain Jenna"}', 4),
  ('ajloun', 'orjan',     '{"ar": "عرجان", "en": "Orjan"}', 5),

  ('karak', 'al_ay',       '{"ar": "العي", "en": "Al-Ay"}', 6),
  ('karak', 'al_faqu',     '{"ar": "الفقوع", "en": "Al-Faqu''"}', 7),
  ('karak', 'al_qatraneh', '{"ar": "القطرانة", "en": "Al-Qatraneh"}', 8),

  ('mafraq', 'ruwaished',    '{"ar": "الرويشد", "en": "Ruwaished"}', 5),
  ('mafraq', 'umm_al_jimal', '{"ar": "أم الجمال", "en": "Umm Al-Jimal"}', 6),
  ('mafraq', 'al_salhiyah',  '{"ar": "الصالحية", "en": "Al-Salhiyah"}', 7),

  ('tafilah', 'al_qadisiyah',  '{"ar": "القادسية", "en": "Al-Qadisiyah"}', 4),
  ('tafilah', 'al_husseiniyah','{"ar": "الحسينية", "en": "Al-Husseiniyah"}', 5),

  ('maan', 'ail', '{"ar": "عيل", "en": "Ail"}', 5),

  ('aqaba', 'wadi_rum', '{"ar": "وادي رم", "en": "Wadi Rum"}', 5)
) AS a(city_key, key, name, sort_order)
JOIN catalog.cities c ON c.key = a.city_key;
