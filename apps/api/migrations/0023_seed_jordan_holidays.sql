-- 0023: Jordan's official public holidays for 2026 and 2027, so the calendar works from day one
-- (QA #13). Fixed-date holidays are exact. The Islamic holidays (Eid al-Fitr, Arafat Day, Eid
-- al-Adha, Islamic New Year, the Prophet's Birthday) are the astronomical estimates: the official
-- dates follow the moon sighting and are announced late, so platform admins should confirm and
-- edit them in the admin panel (العطل الرسمية). Existing rows are never overwritten.
INSERT INTO scheduling.holidays (id, country_code, date, name)
SELECT gen_random_uuid(), 'JO', v.date::date, v.name::jsonb
FROM (VALUES
  ('2026-01-01', '{"ar": "رأس السنة الميلادية", "en": "New Year''s Day"}'),
  ('2026-03-20', '{"ar": "عيد الفطر", "en": "Eid al-Fitr"}'),
  ('2026-03-21', '{"ar": "عيد الفطر", "en": "Eid al-Fitr"}'),
  ('2026-03-22', '{"ar": "عيد الفطر", "en": "Eid al-Fitr"}'),
  ('2026-03-23', '{"ar": "عيد الفطر", "en": "Eid al-Fitr"}'),
  ('2026-05-01', '{"ar": "عيد العمال", "en": "Labour Day"}'),
  ('2026-05-25', '{"ar": "عيد الاستقلال", "en": "Independence Day"}'),
  ('2026-05-26', '{"ar": "يوم عرفة", "en": "Arafat Day"}'),
  ('2026-05-27', '{"ar": "عيد الأضحى", "en": "Eid al-Adha"}'),
  ('2026-05-28', '{"ar": "عيد الأضحى", "en": "Eid al-Adha"}'),
  ('2026-05-29', '{"ar": "عيد الأضحى", "en": "Eid al-Adha"}'),
  ('2026-05-30', '{"ar": "عيد الأضحى", "en": "Eid al-Adha"}'),
  ('2026-06-09', '{"ar": "ذكرى تولي الملك سلطاته الدستورية", "en": "Accession Day"}'),
  ('2026-06-10', '{"ar": "عيد الجيش", "en": "Army Day"}'),
  ('2026-06-16', '{"ar": "رأس السنة الهجرية", "en": "Islamic New Year"}'),
  ('2026-08-25', '{"ar": "المولد النبوي الشريف", "en": "Prophet''s Birthday"}'),
  ('2026-12-25', '{"ar": "عيد الميلاد المجيد", "en": "Christmas Day"}'),
  ('2027-01-01', '{"ar": "رأس السنة الميلادية", "en": "New Year''s Day"}'),
  ('2027-03-09', '{"ar": "عيد الفطر", "en": "Eid al-Fitr"}'),
  ('2027-03-10', '{"ar": "عيد الفطر", "en": "Eid al-Fitr"}'),
  ('2027-03-11', '{"ar": "عيد الفطر", "en": "Eid al-Fitr"}'),
  ('2027-03-12', '{"ar": "عيد الفطر", "en": "Eid al-Fitr"}'),
  ('2027-05-01', '{"ar": "عيد العمال", "en": "Labour Day"}'),
  ('2027-05-15', '{"ar": "يوم عرفة", "en": "Arafat Day"}'),
  ('2027-05-16', '{"ar": "عيد الأضحى", "en": "Eid al-Adha"}'),
  ('2027-05-17', '{"ar": "عيد الأضحى", "en": "Eid al-Adha"}'),
  ('2027-05-18', '{"ar": "عيد الأضحى", "en": "Eid al-Adha"}'),
  ('2027-05-19', '{"ar": "عيد الأضحى", "en": "Eid al-Adha"}'),
  ('2027-05-25', '{"ar": "عيد الاستقلال", "en": "Independence Day"}'),
  ('2027-06-06', '{"ar": "رأس السنة الهجرية", "en": "Islamic New Year"}'),
  ('2027-06-09', '{"ar": "ذكرى تولي الملك سلطاته الدستورية", "en": "Accession Day"}'),
  ('2027-06-10', '{"ar": "عيد الجيش", "en": "Army Day"}'),
  ('2027-08-14', '{"ar": "المولد النبوي الشريف", "en": "Prophet''s Birthday"}'),
  ('2027-12-25', '{"ar": "عيد الميلاد المجيد", "en": "Christmas Day"}')
) AS v(date, name)
ON CONFLICT (country_code, date) DO NOTHING;
