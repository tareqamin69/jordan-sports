#!/usr/bin/env bash
# Shared helpers for backup.sh / restore.sh (see docs/backups.md).
#   PG_MODE=docker (default, on the server): talks to the Compose postgres and api containers.
#   PG_MODE=url    (tests, dev): PGURL=postgres://... and MEDIA_DIR=/path, using local client tools.

PG_MODE=${PG_MODE:-docker}
export RCLONE_LOG_LEVEL=${RCLONE_LOG_LEVEL:-ERROR}
COMPOSE_DIR=${COMPOSE_DIR:-/opt/jordan-sports/app/infra/staging}

load_env() {
  local file=${BACKUP_ENV:-/opt/jordan-sports/backup.env}
  # shellcheck disable=SC1090
  [ -f "$file" ] && { set -a; . "$file"; set +a; }
  return 0
}

log() { echo "[$(date -u +%FT%TZ)] $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

dc() { (cd "$COMPOSE_DIR" && docker compose "$@"); }

# Custom-format dump of the whole application database to stdout.
db_dump() {
  if [ "$PG_MODE" = docker ]; then
    dc exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner'
  else
    pg_dump "$PGURL" --format=custom --no-owner
  fi
}

# Runs SQL in the maintenance context (stdin), for CREATE/DROP DATABASE.
db_admin_sql() {
  if [ "$PG_MODE" = docker ]; then
    dc exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q'
  else
    psql "$PGURL" -v ON_ERROR_STOP=1 -q
  fi
}

db_exists() {
  local n
  if [ "$PG_MODE" = docker ]; then
    n=$(dc exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d postgres -Atc \"select count(*) from pg_database where datname='$1'\"")
  else
    n=$(psql "$PGURL" -Atc "select count(*) from pg_database where datname='$1'")
  fi
  [ "$n" = 1 ]
}

# Restores a custom-format dump (stdin) into an existing empty database $1.
db_restore_into() {
  if [ "$PG_MODE" = docker ]; then
    dc exec -T postgres sh -c "pg_restore -U \"\$POSTGRES_USER\" -d $1 --no-owner --exit-on-error"
  else
    pg_restore --dbname="${PGURL%/*}/$1" --no-owner --exit-on-error
  fi
}

# Runs one query against database $1 and prints the result unaligned.
db_query() {
  if [ "$PG_MODE" = docker ]; then
    dc exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d $1 -Atc \"$2\""
  else
    psql "${PGURL%/*}/$1" -Atc "$2"
  fi
}

# "schema.table count" for every application table, sorted; used to prove a restore is complete.
table_counts() {
  local db=$1 t
  for t in $(db_query "$db" "select schemaname||'.'||tablename from pg_tables where schemaname in ('identity','tenancy','audit','catalog','venue','resource','scheduling','pricing','booking','platform','notification','payment','finance') order by 1"); do
    echo "$t $(db_query "$db" "select count(*) from $t")"
  done
}

# Uploaded photos (the media volume) as a tar stream on stdout.
media_tar() {
  if [ "$PG_MODE" = docker ]; then
    dc exec -T api tar -C /data/media -cf - .
  else
    tar -C "${MEDIA_DIR:?}" -cf - .
  fi
}
