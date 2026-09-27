-- 0003: sport-agnostic catalog, venues, facilities, bookable resources and units (M2).
--
-- Sports, formats and resource types are DATA (docs/architecture.md §E). Nothing in the application
-- code refers to a specific sport; the rows below are reference data for the initial market.

CREATE FUNCTION platform.is_localized_text(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(value) = 'object'
     AND (value ? 'ar' OR value ? 'en')
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(value) e
       WHERE e.key NOT IN ('ar', 'en') OR jsonb_typeof(e.value) <> 'string' OR length(e.value #>> '{}') = 0
     )
$$;

-- Optional translated text: {} or a localized object.
CREATE FUNCTION platform.is_optional_localized_text(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT value = '{}'::jsonb OR platform.is_localized_text(value)
$$;

GRANT EXECUTE ON FUNCTION platform.is_localized_text(jsonb), platform.is_optional_localized_text(jsonb) TO js_app;

-- ---------------------------------------------------------------------------------------------
-- catalog (reference data, managed by platform admins)
-- ---------------------------------------------------------------------------------------------
CREATE SCHEMA catalog;
GRANT USAGE ON SCHEMA catalog TO js_app;

CREATE TABLE catalog.sports (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text    NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]+$'),
  name        jsonb   NOT NULL CHECK (platform.is_localized_text(name)),
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true
);

CREATE TABLE catalog.sport_formats (
  id                        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id                  uuid    NOT NULL REFERENCES catalog.sports (id),
  key                       text    NOT NULL CHECK (key ~ '^[a-z0-9_]+$'),
  name                      jsonb   NOT NULL CHECK (platform.is_localized_text(name)),
  min_players               integer NOT NULL CHECK (min_players >= 1),
  max_players               integer NOT NULL,
  default_duration_minutes  integer NOT NULL CHECK (default_duration_minutes BETWEEN 15 AND 600),
  sort_order                integer NOT NULL DEFAULT 0,
  active                    boolean NOT NULL DEFAULT true,
  UNIQUE (sport_id, key),
  CHECK (max_players >= min_players)
);

-- attribute_schema: {"fields": [{"key", "type": "enum"|"boolean", "label": {ar,en}, "options"?: [{"value", "label"}]}]}
CREATE TABLE catalog.resource_types (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  key               text    NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]+$'),
  name              jsonb   NOT NULL CHECK (platform.is_localized_text(name)),
  attribute_schema  jsonb   NOT NULL DEFAULT '{"fields": []}'::jsonb CHECK (jsonb_typeof(attribute_schema -> 'fields') = 'array'),
  sort_order        integer NOT NULL DEFAULT 0,
  active            boolean NOT NULL DEFAULT true
);

CREATE TABLE catalog.resource_type_formats (
  resource_type_id  uuid NOT NULL REFERENCES catalog.resource_types (id),
  sport_format_id   uuid NOT NULL REFERENCES catalog.sport_formats (id),
  PRIMARY KEY (resource_type_id, sport_format_id)
);

CREATE TABLE catalog.amenities (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text    NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]+$'),
  name        jsonb   NOT NULL CHECK (platform.is_localized_text(name)),
  sort_order  integer NOT NULL DEFAULT 0
);

CREATE TABLE catalog.cities (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text    NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]+$'),
  country_code  char(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  name          jsonb   NOT NULL CHECK (platform.is_localized_text(name)),
  timezone      text    NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0
);

CREATE TABLE catalog.areas (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id     uuid    NOT NULL REFERENCES catalog.cities (id),
  key         text    NOT NULL CHECK (key ~ '^[a-z0-9_]+$'),
  name        jsonb   NOT NULL CHECK (platform.is_localized_text(name)),
  sort_order  integer NOT NULL DEFAULT 0,
  UNIQUE (city_id, key)
);

GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO js_app;
GRANT INSERT, UPDATE ON catalog.sports, catalog.sport_formats, catalog.resource_types,
  catalog.resource_type_formats, catalog.amenities, catalog.cities, catalog.areas TO js_app;

-- ---------------------------------------------------------------------------------------------
-- Reference data for the initial market (Amman; football, padel, tennis).
-- Durations are defaults only; each resource has its own booking policy.
-- ---------------------------------------------------------------------------------------------
INSERT INTO catalog.sports (key, name, sort_order) VALUES
  ('football', '{"ar": "كرة القدم", "en": "Football"}', 1),
  ('padel',    '{"ar": "بادل", "en": "Padel"}', 2),
  ('tennis',   '{"ar": "تنس", "en": "Tennis"}', 3);

INSERT INTO catalog.sport_formats (sport_id, key, name, min_players, max_players, default_duration_minutes, sort_order)
SELECT s.id, f.key, f.name::jsonb, f.min_players, f.max_players, f.duration, f.sort_order
FROM (VALUES
  ('football', 'five_a_side',   '{"ar": "خماسي", "en": "5-a-side"}',   6, 10, 60, 1),
  ('football', 'six_a_side',    '{"ar": "سداسي", "en": "6-a-side"}',   8, 12, 60, 2),
  ('football', 'seven_a_side',  '{"ar": "سباعي", "en": "7-a-side"}',  10, 14, 60, 3),
  ('football', 'eleven_a_side', '{"ar": "11 لاعبًا", "en": "11-a-side"}', 14, 22, 90, 4),
  ('padel',    'doubles',       '{"ar": "زوجي", "en": "Doubles"}',     4,  4, 90, 1),
  ('tennis',   'singles',       '{"ar": "فردي", "en": "Singles"}',     2,  2, 60, 1),
  ('tennis',   'doubles',       '{"ar": "زوجي", "en": "Doubles"}',     4,  4, 60, 2)
) AS f(sport, key, name, min_players, max_players, duration, sort_order)
JOIN catalog.sports s ON s.key = f.sport;

INSERT INTO catalog.resource_types (key, name, attribute_schema, sort_order) VALUES
  ('football_pitch', '{"ar": "ملعب كرة قدم", "en": "Football pitch"}', '{"fields": [
    {"key": "surface", "type": "enum", "label": {"ar": "الأرضية", "en": "Surface"}, "options": [
      {"value": "artificial_grass", "label": {"ar": "عشب صناعي", "en": "Artificial grass"}},
      {"value": "natural_grass", "label": {"ar": "عشب طبيعي", "en": "Natural grass"}},
      {"value": "hard_court", "label": {"ar": "أرضية صلبة", "en": "Hard court"}}]},
    {"key": "indoor", "type": "boolean", "label": {"ar": "داخلي (مغطّى)", "en": "Indoor"}},
    {"key": "lighting", "type": "boolean", "label": {"ar": "إنارة ليلية", "en": "Floodlights"}}]}', 1),
  ('padel_court', '{"ar": "ملعب بادل", "en": "Padel court"}', '{"fields": [
    {"key": "indoor", "type": "boolean", "label": {"ar": "داخلي (مغطّى)", "en": "Indoor"}},
    {"key": "panoramic", "type": "boolean", "label": {"ar": "زجاج بانورامي", "en": "Panoramic glass"}},
    {"key": "lighting", "type": "boolean", "label": {"ar": "إنارة ليلية", "en": "Floodlights"}}]}', 2),
  ('tennis_court', '{"ar": "ملعب تنس", "en": "Tennis court"}', '{"fields": [
    {"key": "surface", "type": "enum", "label": {"ar": "الأرضية", "en": "Surface"}, "options": [
      {"value": "hard_court", "label": {"ar": "أرضية صلبة", "en": "Hard court"}},
      {"value": "clay", "label": {"ar": "رملية (كلاي)", "en": "Clay"}},
      {"value": "artificial_grass", "label": {"ar": "عشب صناعي", "en": "Artificial grass"}}]},
    {"key": "indoor", "type": "boolean", "label": {"ar": "داخلي (مغطّى)", "en": "Indoor"}},
    {"key": "lighting", "type": "boolean", "label": {"ar": "إنارة ليلية", "en": "Floodlights"}}]}', 3);

INSERT INTO catalog.resource_type_formats (resource_type_id, sport_format_id)
SELECT rt.id, f.id
FROM (VALUES
  ('football_pitch', 'football', 'five_a_side'),
  ('football_pitch', 'football', 'six_a_side'),
  ('football_pitch', 'football', 'seven_a_side'),
  ('football_pitch', 'football', 'eleven_a_side'),
  ('padel_court', 'padel', 'doubles'),
  ('tennis_court', 'tennis', 'singles'),
  ('tennis_court', 'tennis', 'doubles')
) AS m(type_key, sport_key, format_key)
JOIN catalog.resource_types rt ON rt.key = m.type_key
JOIN catalog.sports s ON s.key = m.sport_key
JOIN catalog.sport_formats f ON f.sport_id = s.id AND f.key = m.format_key;

INSERT INTO catalog.amenities (key, name, sort_order) VALUES
  ('parking',          '{"ar": "مواقف سيارات", "en": "Parking"}', 1),
  ('changing_rooms',   '{"ar": "غرف تبديل ملابس", "en": "Changing rooms"}', 2),
  ('showers',          '{"ar": "دوش", "en": "Showers"}', 3),
  ('prayer_room',      '{"ar": "مصلّى", "en": "Prayer room"}', 4),
  ('cafe',             '{"ar": "كافتيريا", "en": "Café"}', 5),
  ('equipment_rental', '{"ar": "تأجير معدات", "en": "Equipment rental"}', 6),
  ('spectator_seating','{"ar": "مقاعد للمتفرجين", "en": "Spectator seating"}', 7),
  ('accessible',       '{"ar": "مناسب لذوي الإعاقة", "en": "Wheelchair accessible"}', 8);

INSERT INTO catalog.cities (key, country_code, name, timezone, sort_order) VALUES
  ('amman', 'JO', '{"ar": "عمّان", "en": "Amman"}', 'Asia/Amman', 1);

INSERT INTO catalog.areas (city_id, key, name, sort_order)
SELECT c.id, a.key, a.name::jsonb, a.sort_order
FROM (VALUES
  ('abdoun',        '{"ar": "عبدون", "en": "Abdoun"}', 1),
  ('sweifieh',      '{"ar": "الصويفية", "en": "Sweifieh"}', 2),
  ('khalda',        '{"ar": "خلدا", "en": "Khalda"}', 3),
  ('dabouq',        '{"ar": "دابوق", "en": "Dabouq"}', 4),
  ('jubeiha',       '{"ar": "الجبيهة", "en": "Jubeiha"}', 5),
  ('shmeisani',     '{"ar": "الشميساني", "en": "Shmeisani"}', 6),
  ('tla_al_ali',    '{"ar": "تلاع العلي", "en": "Tla'' Al-Ali"}', 7),
  ('marj_al_hamam', '{"ar": "مرج الحمام", "en": "Marj Al-Hamam"}', 8),
  ('abu_nseir',     '{"ar": "أبو نصير", "en": "Abu Nseir"}', 9),
  ('um_uthaina',    '{"ar": "أم أذينة", "en": "Um Uthaina"}', 10),
  ('airport_road',  '{"ar": "طريق المطار", "en": "Airport Road"}', 11),
  ('tabarbour',     '{"ar": "طبربور", "en": "Tabarbour"}', 12)
) AS a(key, name, sort_order)
CROSS JOIN catalog.cities c WHERE c.key = 'amman';

-- ---------------------------------------------------------------------------------------------
-- venue
-- ---------------------------------------------------------------------------------------------
CREATE SCHEMA venue;
GRANT USAGE ON SCHEMA venue TO js_app;

CREATE TABLE venue.venues (
  id                         uuid        PRIMARY KEY,
  organization_id            uuid        NOT NULL REFERENCES tenancy.organizations (id),
  slug                       text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 60),
  name                       jsonb       NOT NULL CHECK (platform.is_localized_text(name)),
  description                jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (platform.is_optional_localized_text(description)),
  status                     text        NOT NULL DEFAULT 'draft'
                                         CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'suspended')),
  -- IANA time zone of the venue; all local scheduling is interpreted in it (§H).
  timezone                   text        NOT NULL DEFAULT 'Asia/Amman',
  currency                   char(3)     NOT NULL DEFAULT 'JOD' CHECK (currency ~ '^[A-Z]{3}$'),
  city_id                    uuid        NOT NULL REFERENCES catalog.cities (id),
  area_id                    uuid        REFERENCES catalog.areas (id),
  address                    jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (platform.is_optional_localized_text(address)),
  location                   geography(Point, 4326),
  contact_phone              text        CHECK (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  -- Minutes after local midnight at which the venue's business day starts (a 01:00 slot belongs
  -- to the previous day's calendar when this is later than 01:00).
  business_day_start_minute  integer     NOT NULL DEFAULT 360 CHECK (business_day_start_minute BETWEEN 0 AND 720),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  archived_at                timestamptz
);
CREATE INDEX venues_org_idx ON venue.venues (organization_id);
CREATE INDEX venues_public_idx ON venue.venues (city_id, area_id) WHERE status = 'approved' AND archived_at IS NULL;
CREATE INDEX venues_location_gix ON venue.venues USING gist (location);
CREATE TRIGGER venues_touch BEFORE UPDATE ON venue.venues
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE venue.venue_amenities (
  venue_id    uuid NOT NULL REFERENCES venue.venues (id),
  amenity_id  uuid NOT NULL REFERENCES catalog.amenities (id),
  PRIMARY KEY (venue_id, amenity_id)
);

CREATE TABLE venue.facilities (
  id           uuid        PRIMARY KEY,
  venue_id     uuid        NOT NULL REFERENCES venue.venues (id),
  name         jsonb       NOT NULL CHECK (platform.is_localized_text(name)),
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz
);
CREATE INDEX facilities_venue_idx ON venue.facilities (venue_id);

CREATE TABLE venue.media (
  id           uuid        PRIMARY KEY,
  venue_id     uuid        NOT NULL REFERENCES venue.venues (id),
  -- Opaque storage key; images are re-encoded to WebP (metadata such as GPS is removed).
  storage_key  text        NOT NULL UNIQUE,
  content_type text        NOT NULL CHECK (content_type IN ('image/webp')),
  width        integer     NOT NULL CHECK (width > 0),
  height       integer     NOT NULL CHECK (height > 0),
  byte_size    integer     NOT NULL CHECK (byte_size > 0),
  sort_order   integer     NOT NULL DEFAULT 0,
  created_by   uuid        REFERENCES identity.users (id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_venue_idx ON venue.media (venue_id, sort_order);

GRANT SELECT, INSERT, UPDATE ON venue.venues, venue.facilities TO js_app;
GRANT SELECT, INSERT, DELETE ON venue.venue_amenities, venue.media TO js_app;

-- ---------------------------------------------------------------------------------------------
-- resource: bookable resources map to atomic units (ADR-0004). A full pitch maps to the units of
-- its halves, so a booking of either blocks the other.
-- ---------------------------------------------------------------------------------------------
CREATE SCHEMA resource;
GRANT USAGE ON SCHEMA resource TO js_app;

CREATE TABLE resource.resources (
  id                uuid        PRIMARY KEY,
  venue_id          uuid        NOT NULL REFERENCES venue.venues (id),
  facility_id       uuid        REFERENCES venue.facilities (id),
  resource_type_id  uuid        NOT NULL REFERENCES catalog.resource_types (id),
  name              jsonb       NOT NULL CHECK (platform.is_localized_text(name)),
  attributes        jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  sort_order        integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resources_venue_idx ON resource.resources (venue_id);
CREATE TRIGGER resources_touch BEFORE UPDATE ON resource.resources
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE resource.units (
  id          uuid        PRIMARY KEY,
  venue_id    uuid        NOT NULL REFERENCES venue.venues (id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE resource.resource_units (
  resource_id  uuid NOT NULL REFERENCES resource.resources (id),
  unit_id      uuid NOT NULL REFERENCES resource.units (id),
  PRIMARY KEY (resource_id, unit_id)
);
CREATE INDEX resource_units_unit_idx ON resource.resource_units (unit_id);

CREATE TABLE resource.resource_formats (
  resource_id      uuid NOT NULL REFERENCES resource.resources (id),
  sport_format_id  uuid NOT NULL REFERENCES catalog.sport_formats (id),
  PRIMARY KEY (resource_id, sport_format_id)
);

CREATE TABLE resource.booking_policies (
  resource_id              uuid        PRIMARY KEY REFERENCES resource.resources (id),
  -- Allowed booking lengths in minutes, e.g. {60,90,120}.
  slot_durations           integer[]   NOT NULL CHECK (
                             cardinality(slot_durations) BETWEEN 1 AND 8
                             AND 15 <= ALL (slot_durations) AND 600 >= ALL (slot_durations)
                           ),
  -- Bookings may start every N minutes from the start of an opening window.
  start_alignment_minutes  integer     NOT NULL DEFAULT 30 CHECK (start_alignment_minutes IN (15, 30, 60)),
  min_lead_minutes         integer     NOT NULL DEFAULT 60 CHECK (min_lead_minutes BETWEEN 0 AND 10080),
  max_advance_days         integer     NOT NULL DEFAULT 14 CHECK (max_advance_days BETWEEN 1 AND 365),
  buffer_before_minutes    integer     NOT NULL DEFAULT 0 CHECK (buffer_before_minutes BETWEEN 0 AND 120),
  buffer_after_minutes     integer     NOT NULL DEFAULT 0 CHECK (buffer_after_minutes BETWEEN 0 AND 120),
  hold_minutes             integer     NOT NULL DEFAULT 10 CHECK (hold_minutes BETWEEN 1 AND 60),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON resource.resources, resource.units, resource.booking_policies TO js_app;
GRANT SELECT, INSERT, DELETE ON resource.resource_units, resource.resource_formats TO js_app;
