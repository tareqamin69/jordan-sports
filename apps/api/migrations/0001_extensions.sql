-- 0001: PostgreSQL extensions required by the architecture (ADR-0003).
--   postgis     geography columns and distance search (venues)
--   btree_gist  equality + range operators in one GiST exclusion constraint (occupancy, ADR-0004)
--   pg_trgm     trigram similarity search (Arabic/English names)
--   citext      case-insensitive text (emails)

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
