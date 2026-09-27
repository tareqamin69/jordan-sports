-- 0008: Jordan-wide geography (all 12 governorates, not just Amman) and a full sports catalog
-- (was football/padel/tennis only), plus a review queue for venue owners requesting a sport that
-- is not yet in the catalog. See docs/plans/jordan-wide-cliq-marketplace.md §1.

-- 0008a: the remaining 11 governorates (Jordan-wide coverage) with their main areas,
-- and 8 more Amman areas. Timezone is Asia/Amman everywhere (one time zone for the country).
INSERT INTO catalog.cities (key, country_code, name, timezone, sort_order) VALUES
  ('irbid', 'JO', '{"ar": "إربد", "en": "Irbid"}'::jsonb, 'Asia/Amman', 2),
  ('zarqa', 'JO', '{"ar": "الزرقاء", "en": "Zarqa"}'::jsonb, 'Asia/Amman', 3),
  ('aqaba', 'JO', '{"ar": "العقبة", "en": "Aqaba"}'::jsonb, 'Asia/Amman', 4),
  ('balqa', 'JO', '{"ar": "البلقاء", "en": "Balqa"}'::jsonb, 'Asia/Amman', 5),
  ('madaba', 'JO', '{"ar": "مادبا", "en": "Madaba"}'::jsonb, 'Asia/Amman', 6),
  ('jerash', 'JO', '{"ar": "جرش", "en": "Jerash"}'::jsonb, 'Asia/Amman', 7),
  ('ajloun', 'JO', '{"ar": "عجلون", "en": "Ajloun"}'::jsonb, 'Asia/Amman', 8),
  ('karak', 'JO', '{"ar": "الكرك", "en": "Karak"}'::jsonb, 'Asia/Amman', 9),
  ('mafraq', 'JO', '{"ar": "المفرق", "en": "Mafraq"}'::jsonb, 'Asia/Amman', 10),
  ('tafilah', 'JO', '{"ar": "الطفيلة", "en": "Tafilah"}'::jsonb, 'Asia/Amman', 11),
  ('maan', 'JO', '{"ar": "معان", "en": "Ma''an"}'::jsonb, 'Asia/Amman', 12);

INSERT INTO catalog.areas (city_id, key, name, sort_order)
SELECT c.id, a.key, a.name::jsonb, a.sort_order FROM (VALUES
  ('irbid', 'irbid_city', '{"ar": "مدينة إربد", "en": "Irbid City"}', 1),
  ('irbid', 'university_street', '{"ar": "شارع الجامعة", "en": "University Street"}', 2),
  ('irbid', 'al_husn', '{"ar": "الحصن", "en": "Al-Husn"}', 3),
  ('irbid', 'ramtha', '{"ar": "الرمثا", "en": "Ramtha"}', 4),
  ('irbid', 'bani_kinanah', '{"ar": "بني كنانة", "en": "Bani Kinanah"}', 5),
  ('irbid', 'al_koura', '{"ar": "الكورة", "en": "Al-Koura"}', 6),
  ('irbid', 'al_mazar_al_shamali', '{"ar": "المزار الشمالي", "en": "Al-Mazar Al-Shamali"}', 7),
  ('irbid', 'al_taybeh', '{"ar": "الطيبة", "en": "Al-Taybeh"}', 8),
  ('irbid', 'northern_jordan_valley', '{"ar": "الأغوار الشمالية", "en": "Northern Jordan Valley"}', 9),
  ('zarqa', 'zarqa_city', '{"ar": "مدينة الزرقاء", "en": "Zarqa City"}', 1),
  ('zarqa', 'new_zarqa', '{"ar": "الزرقاء الجديدة", "en": "New Zarqa"}', 2),
  ('zarqa', 'russeifa', '{"ar": "الرصيفة", "en": "Russeifa"}', 3),
  ('zarqa', 'al_hashemiyya', '{"ar": "الهاشمية", "en": "Al-Hashemiyya"}', 4),
  ('zarqa', 'al_dhlail', '{"ar": "الضليل", "en": "Al-Dhlail"}', 5),
  ('zarqa', 'azraq', '{"ar": "الأزرق", "en": "Azraq"}', 6),
  ('zarqa', 'birain', '{"ar": "برين", "en": "Birain"}', 7),
  ('aqaba', 'aqaba_city', '{"ar": "مدينة العقبة", "en": "Aqaba City"}', 1),
  ('aqaba', 'south_beach', '{"ar": "الشاطئ الجنوبي", "en": "South Beach"}', 2),
  ('aqaba', 'al_quwayrah', '{"ar": "القويرة", "en": "Al-Quwayrah"}', 3),
  ('aqaba', 'wadi_araba', '{"ar": "وادي عربة", "en": "Wadi Araba"}', 4),
  ('balqa', 'salt', '{"ar": "السلط", "en": "Salt"}', 1),
  ('balqa', 'fuheis', '{"ar": "الفحيص", "en": "Fuheis"}', 2),
  ('balqa', 'mahis', '{"ar": "ماحص", "en": "Mahis"}', 3),
  ('balqa', 'ain_al_basha', '{"ar": "عين الباشا", "en": "Ain Al-Basha"}', 4),
  ('balqa', 'deir_alla', '{"ar": "دير علا", "en": "Deir Alla"}', 5),
  ('balqa', 'southern_shouneh', '{"ar": "الشونة الجنوبية", "en": "Southern Shouneh"}', 6),
  ('madaba', 'madaba_city', '{"ar": "مدينة مادبا", "en": "Madaba City"}', 1),
  ('madaba', 'dhiban', '{"ar": "ذيبان", "en": "Dhiban"}', 2),
  ('madaba', 'mleih', '{"ar": "مليح", "en": "Mleih"}', 3),
  ('jerash', 'jerash_city', '{"ar": "مدينة جرش", "en": "Jerash City"}', 1),
  ('jerash', 'souf', '{"ar": "صوف", "en": "Souf"}', 2),
  ('jerash', 'al_mastaba', '{"ar": "المصطبة", "en": "Al-Mastaba"}', 3),
  ('ajloun', 'ajloun_city', '{"ar": "مدينة عجلون", "en": "Ajloun City"}', 1),
  ('ajloun', 'anjara', '{"ar": "عنجرة", "en": "Anjara"}', 2),
  ('ajloun', 'kufranjah', '{"ar": "كفرنجة", "en": "Kufranjah"}', 3),
  ('karak', 'karak_city', '{"ar": "مدينة الكرك", "en": "Karak City"}', 1),
  ('karak', 'mutah', '{"ar": "مؤتة", "en": "Mutah"}', 2),
  ('karak', 'al_mazar_al_janoubi', '{"ar": "المزار الجنوبي", "en": "Al-Mazar Al-Janoubi"}', 3),
  ('karak', 'al_qasr', '{"ar": "القصر", "en": "Al-Qasr"}', 4),
  ('karak', 'ghor_al_safi', '{"ar": "غور الصافي", "en": "Ghor Al-Safi"}', 5),
  ('mafraq', 'mafraq_city', '{"ar": "مدينة المفرق", "en": "Mafraq City"}', 1),
  ('mafraq', 'al_khaldiyya', '{"ar": "الخالدية", "en": "Al-Khaldiyya"}', 2),
  ('mafraq', 'sama_al_sirhan', '{"ar": "سما السرحان", "en": "Sama Al-Sirhan"}', 3),
  ('mafraq', 'northern_badia', '{"ar": "البادية الشمالية", "en": "Northern Badia"}', 4),
  ('tafilah', 'tafilah_city', '{"ar": "مدينة الطفيلة", "en": "Tafilah City"}', 1),
  ('tafilah', 'busayra', '{"ar": "بصيرا", "en": "Busayra"}', 2),
  ('tafilah', 'al_hasa', '{"ar": "الحسا", "en": "Al-Hasa"}', 3),
  ('maan', 'maan_city', '{"ar": "مدينة معان", "en": "Ma''an City"}', 1),
  ('maan', 'petra', '{"ar": "البترا (وادي موسى)", "en": "Petra (Wadi Musa)"}', 2),
  ('maan', 'shoubak', '{"ar": "الشوبك", "en": "Shoubak"}', 3),
  ('maan', 'al_husseiniyya', '{"ar": "الحسينية", "en": "Al-Husseiniyya"}', 4)
) AS a(city_key, key, name, sort_order)
JOIN catalog.cities c ON c.key = a.city_key;

INSERT INTO catalog.areas (city_id, key, name, sort_order)
SELECT c.id, a.key, a.name::jsonb, a.sort_order FROM (VALUES
  ('jabal_amman', '{"ar": "جبل عمّان", "en": "Jabal Amman"}', 13),
  ('jabal_al_hussein', '{"ar": "جبل الحسين", "en": "Jabal Al-Hussein"}', 14),
  ('wadi_saqra', '{"ar": "وادي صقرة", "en": "Wadi Saqra"}', 15),
  ('um_al_summaq', '{"ar": "أم السماق", "en": "Um Al-Summaq"}', 16),
  ('sweileh', '{"ar": "صويلح", "en": "Sweileh"}', 17),
  ('marka', '{"ar": "ماركا", "en": "Marka"}', 18),
  ('sahab', '{"ar": "سحاب", "en": "Sahab"}', 19),
  ('naour', '{"ar": "ناعور", "en": "Naour"}', 20)
) AS a(key, name, sort_order)
CROSS JOIN catalog.cities c WHERE c.key = 'amman';

-- 0008b: a full sports catalog for Jordan (was football/padel/tennis only). Every sport
-- is data: no code branches on a specific sport (docs/architecture.md §E). Admins can add
-- more sports at any time from /admin (see catalog.sport_requests below for owner requests).
INSERT INTO catalog.sports (key, name, icon, sort_order) VALUES
  ('basketball', '{"ar": "كرة السلة", "en": "Basketball"}'::jsonb, 'ball-bounce', 4),
  ('volleyball', '{"ar": "الكرة الطائرة", "en": "Volleyball"}'::jsonb, 'ball-volley', 5),
  ('squash', '{"ar": "سكواش", "en": "Squash"}'::jsonb, 'racket-squash', 6),
  ('badminton', '{"ar": "الريشة الطائرة", "en": "Badminton"}'::jsonb, 'shuttlecock', 7),
  ('table_tennis', '{"ar": "تنس الطاولة", "en": "Table tennis"}'::jsonb, 'paddle-tt', 8),
  ('billiards', '{"ar": "البلياردو والسنوكر", "en": "Billiards & snooker"}'::jsonb, 'cue-ball', 9),
  ('swimming', '{"ar": "السباحة", "en": "Swimming"}'::jsonb, 'wave', 10),
  ('gym', '{"ar": "الجيم واللياقة", "en": "Gym & fitness"}'::jsonb, 'dumbbell', 11),
  ('bowling', '{"ar": "البولينغ", "en": "Bowling"}'::jsonb, 'bowling-pin', 12),
  ('handball', '{"ar": "كرة اليد", "en": "Handball"}'::jsonb, 'ball-handball', 13),
  ('martial_arts', '{"ar": "الفنون القتالية والملاكمة", "en": "Martial arts & boxing"}'::jsonb, 'glove', 14);

INSERT INTO catalog.sport_formats (sport_id, key, name, min_players, max_players, default_duration_minutes, sort_order)
SELECT s.id, f.key, f.name::jsonb, f.min_players, f.max_players, f.duration, f.sort_order
FROM (VALUES
  ('basketball', 'five_a_side', '{"ar": "خماسي كامل الملعب", "en": "Full court (5v5)"}', 8, 12, 60, 1),
  ('basketball', 'three_x_three', '{"ar": "ثلاثي نصف ملعب", "en": "Half court (3x3)"}', 4, 8, 30, 2),
  ('volleyball', 'six_a_side', '{"ar": "سداسي", "en": "6-a-side"}', 10, 14, 60, 1),
  ('squash', 'singles', '{"ar": "فردي", "en": "Singles"}', 2, 2, 45, 1),
  ('badminton', 'singles', '{"ar": "فردي", "en": "Singles"}', 2, 2, 60, 1),
  ('badminton', 'doubles', '{"ar": "زوجي", "en": "Doubles"}', 4, 4, 60, 2),
  ('table_tennis', 'singles', '{"ar": "فردي", "en": "Singles"}', 2, 2, 30, 1),
  ('table_tennis', 'doubles', '{"ar": "زوجي", "en": "Doubles"}', 4, 4, 30, 2),
  ('billiards', 'game', '{"ar": "لعبة", "en": "Game"}', 2, 4, 60, 1),
  ('swimming', 'lane_session', '{"ar": "حصة حارة سباحة", "en": "Lane session"}', 1, 6, 60, 1),
  ('gym', 'session', '{"ar": "حصة تدريب", "en": "Gym session"}', 1, 1, 60, 1),
  ('bowling', 'lane_session', '{"ar": "حصة مسار بولينغ", "en": "Lane session"}', 1, 6, 60, 1),
  ('handball', 'seven_a_side', '{"ar": "سباعي", "en": "7-a-side"}', 12, 18, 60, 1),
  ('martial_arts', 'training_session', '{"ar": "حصة تدريب", "en": "Training session"}', 1, 20, 60, 1)
) AS f(sport, key, name, min_players, max_players, duration, sort_order)
JOIN catalog.sports s ON s.key = f.sport;

INSERT INTO catalog.resource_types (key, name, attribute_schema, sort_order) VALUES
  ('basketball_court', '{"ar": "ملعب كرة سلة", "en": "Basketball court"}', '{"fields": [{"key": "surface", "type": "enum", "label": {"ar": "الأرضية", "en": "Surface"}, "options": [{"value": "hardwood", "label": {"ar": "باركيه", "en": "Hardwood"}}, {"value": "asphalt", "label": {"ar": "إسفلت", "en": "Asphalt"}}, {"value": "synthetic", "label": {"ar": "أرضية صناعية", "en": "Synthetic"}}]}, {"key": "indoor", "type": "boolean", "label": {"ar": "داخلي (مغطّى)", "en": "Indoor"}}, {"key": "lighting", "type": "boolean", "label": {"ar": "إنارة ليلية", "en": "Floodlights"}}]}', 4),
  ('volleyball_court', '{"ar": "ملعب كرة طائرة", "en": "Volleyball court"}', '{"fields": [{"key": "surface", "type": "enum", "label": {"ar": "الأرضية", "en": "Surface"}, "options": [{"value": "indoor", "label": {"ar": "أرضية صالة", "en": "Indoor floor"}}, {"value": "sand", "label": {"ar": "رملية (شاطئية)", "en": "Sand (beach)"}}]}, {"key": "lighting", "type": "boolean", "label": {"ar": "إنارة ليلية", "en": "Floodlights"}}]}', 5),
  ('squash_court', '{"ar": "ملعب سكواش", "en": "Squash court"}', '{"fields": [{"key": "air_conditioned", "type": "boolean", "label": {"ar": "مكيّف", "en": "Air-conditioned"}}]}', 6),
  ('badminton_court', '{"ar": "ملعب ريشة طائرة", "en": "Badminton court"}', '{"fields": [{"key": "indoor", "type": "boolean", "label": {"ar": "داخلي (مغطّى)", "en": "Indoor"}}, {"key": "lighting", "type": "boolean", "label": {"ar": "إنارة", "en": "Lighting"}}]}', 7),
  ('table_tennis_table', '{"ar": "طاولة تنس طاولة", "en": "Table tennis table"}', '{"fields": [{"key": "indoor", "type": "boolean", "label": {"ar": "داخلي", "en": "Indoor"}}]}', 8),
  ('billiards_table', '{"ar": "طاولة بلياردو", "en": "Billiards table"}', '{"fields": [{"key": "table_type", "type": "enum", "label": {"ar": "نوع الطاولة", "en": "Table type"}, "options": [{"value": "pool", "label": {"ar": "بلياردو أمريكي", "en": "Pool"}}, {"value": "snooker", "label": {"ar": "سنوكر", "en": "Snooker"}}, {"value": "carom", "label": {"ar": "بلياردو فرنسي", "en": "Carom"}}]}]}', 9),
  ('swimming_lane', '{"ar": "حارة سباحة", "en": "Swimming lane"}', '{"fields": [{"key": "heated", "type": "boolean", "label": {"ar": "مُدفّأة", "en": "Heated"}}, {"key": "indoor", "type": "boolean", "label": {"ar": "داخلية (مغطّاة)", "en": "Indoor"}}]}', 10),
  ('gym_session', '{"ar": "حصة جيم", "en": "Gym session slot"}', '{"fields": [{"key": "has_trainer", "type": "boolean", "label": {"ar": "مدرب متوفر", "en": "Trainer available"}}]}', 11),
  ('bowling_lane', '{"ar": "مسار بولينغ", "en": "Bowling lane"}', '{"fields": []}', 12),
  ('handball_court', '{"ar": "ملعب كرة يد", "en": "Handball court"}', '{"fields": [{"key": "indoor", "type": "boolean", "label": {"ar": "داخلي (مغطّى)", "en": "Indoor"}}, {"key": "lighting", "type": "boolean", "label": {"ar": "إنارة ليلية", "en": "Floodlights"}}]}', 13),
  ('martial_arts_mat', '{"ar": "حلبة / صالة فنون قتالية", "en": "Martial arts mat / ring"}', '{"fields": [{"key": "mirrors", "type": "boolean", "label": {"ar": "مرايا", "en": "Mirrors"}}]}', 14);

INSERT INTO catalog.resource_type_formats (resource_type_id, sport_format_id)
SELECT rt.id, f.id
FROM (VALUES
  ('basketball_court', 'basketball', 'five_a_side'),
  ('basketball_court', 'basketball', 'three_x_three'),
  ('volleyball_court', 'volleyball', 'six_a_side'),
  ('squash_court', 'squash', 'singles'),
  ('badminton_court', 'badminton', 'singles'),
  ('badminton_court', 'badminton', 'doubles'),
  ('table_tennis_table', 'table_tennis', 'singles'),
  ('table_tennis_table', 'table_tennis', 'doubles'),
  ('billiards_table', 'billiards', 'game'),
  ('swimming_lane', 'swimming', 'lane_session'),
  ('gym_session', 'gym', 'session'),
  ('bowling_lane', 'bowling', 'lane_session'),
  ('handball_court', 'handball', 'seven_a_side'),
  ('martial_arts_mat', 'martial_arts', 'training_session')
) AS m(type_key, sport_key, format_key)
JOIN catalog.resource_types rt ON rt.key = m.type_key
JOIN catalog.sports s ON s.key = m.sport_key
JOIN catalog.sport_formats f ON f.sport_id = s.id AND f.key = m.format_key;

-- ---------------------------------------------------------------------------------------------
-- Sport requests: a venue owner asks for a sport that isn't in the catalog yet; an admin adds
-- the sport (catalog.sports etc., via the admin catalog endpoints) and approves or rejects the
-- request. This never blocks the owner from finishing registration with the sports that already
-- exist — the request is informational until acted on.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE catalog.sport_requests (
  id                uuid        PRIMARY KEY,
  organization_id   uuid        NOT NULL REFERENCES tenancy.organizations (id),
  requested_by      uuid        REFERENCES identity.users (id),
  name              text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  note              text        CHECK (char_length(note) <= 500),
  status            text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  resolved_sport_id uuid        REFERENCES catalog.sports (id),
  rejection_reason  text        CHECK (char_length(rejection_reason) <= 500),
  resolved_by       uuid        REFERENCES identity.users (id),
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sport_requests_resolution CHECK (
    (status = 'pending' AND resolved_at IS NULL) OR
    (status = 'approved' AND resolved_at IS NOT NULL) OR
    (status = 'rejected' AND resolved_at IS NOT NULL AND rejection_reason IS NOT NULL)
  )
);
CREATE INDEX sport_requests_pending_idx ON catalog.sport_requests (created_at) WHERE status = 'pending';
GRANT SELECT, INSERT, UPDATE ON catalog.sport_requests TO js_app;
