#!/usr/bin/env bash
# Restores a backup into a NEW database (never over the live one) and checks it.
#   restore.sh --identity age-key.txt --from offsite:jorena-backups [--stamp 20260928T031500Z|latest]
#              --target-db jorena_restored [--media-dir /tmp/media] [--drop]
# --from can also be a local folder holding the backup files. See docs/backups.md for putting the
# restored database into service.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$HERE/lib.sh"
load_env
identity= from= stamp=latest target= media= drop=0
while [ $# -gt 0 ]; do
  case $1 in
    --identity) identity=$2; shift 2 ;;
    --from) from=$2; shift 2 ;;
    --stamp) stamp=$2; shift 2 ;;
    --target-db) target=$2; shift 2 ;;
    --media-dir) media=$2; shift 2 ;;
    --drop) drop=1; shift ;;
    *) die "unknown option $1" ;;
  esac
done
[ -f "$identity" ] && [ -n "$from" ] && [ -n "$target" ] || die "need --identity, --from and --target-db"
[[ "$target" =~ ^[a-z][a-z0-9_]{2,40}$ ]] || die "--target-db must be lowercase letters, digits and underscores"
live=${POSTGRES_DB:-jordan_sports}
[ "$target" != "$live" ] || die "refusing to restore over the live database ($live); see docs/backups.md"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
if [ -d "$from" ]; then
  src=$from
  [ "$stamp" = latest ] || src=$from/$stamp
else
  if [ "$stamp" = latest ]; then
    stamp=$(rclone lsf --dirs-only "$from" | tr -d '/' | sort | tail -1)
    [ -n "$stamp" ] || die "no backups found in $from"
  fi
  log "downloading backup $stamp"
  rclone copy "$from/$stamp" "$work/in"
  src=$work/in
fi
log "checking file hashes"
(cd "$src" && sha256sum --check --strict SHA256SUMS >/dev/null) || die "backup files are damaged or were changed"

# Decrypt everything first: a wrong key or damaged file must not leave a half-made database.
age -d -i "$identity" -o "$work/db.dump" "$src/db.dump.age" || die "cannot decrypt the backup (wrong key?)"
if [ -n "$media" ]; then age -d -i "$identity" -o "$work/media.tar" "$src/media.tar.age" || die "cannot decrypt the photos"; fi

if db_exists "$target"; then
  [ "$drop" = 1 ] || die "database $target already exists (use --drop to replace it)"
  echo "DROP DATABASE $target;" | db_admin_sql
fi
echo "CREATE DATABASE $target;" | db_admin_sql
# The dump grants to the application role; on a brand-new server it may not exist yet.
echo "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='js_app') THEN CREATE ROLE js_app NOLOGIN; END IF; END \$\$;" | db_admin_sql
log "restoring database into $target"
if ! db_restore_into "$target" < "$work/db.dump"; then
  echo "DROP DATABASE IF EXISTS $target;" | db_admin_sql
  die "restore failed; the partly restored database $target was removed"
fi

if [ -n "$media" ]; then
  mkdir -p "$media"
  log "restoring photos into $media"
  tar -C "$media" -xf "$work/media.tar"
fi
migrations=$(db_query "$target" "select count(*) from public.schema_migrations" 2>/dev/null || echo '?')
tables=$(table_counts "$target" | wc -l)
log "RESTORE OK: database=$target tables=$tables migrations=$migrations"
