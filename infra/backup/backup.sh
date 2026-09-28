#!/usr/bin/env bash
# Daily encrypted backup of the database and uploaded photos to off-server storage.
# Config: /opt/jordan-sports/backup.env (see docs/backups.md). Exits non-zero on any failure.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$HERE/lib.sh"
load_env
: "${BACKUP_REMOTE:?BACKUP_REMOTE (an rclone path such as offsite:jorena-backups) is not set}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT (the age public key) is not set}"
KEEP_DAYS=${BACKUP_KEEP_DAYS:-30}
KEEP_MIN=${BACKUP_KEEP_MIN:-7}
STATE=${BACKUP_STATE_DIR:-/var/log/jordan-sports}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

log "dumping database"
db_dump | age -r "$BACKUP_AGE_RECIPIENT" -o "$tmp/db.dump.age"
log "archiving photos"
media_tar | age -r "$BACKUP_AGE_RECIPIENT" -o "$tmp/media.tar.age"
# A dump that is nearly empty means pg_dump failed quietly; never upload it as a good backup.
[ "$(stat -c %s "$tmp/db.dump.age")" -gt 2048 ] || die "database dump is suspiciously small"
(cd "$tmp" && sha256sum db.dump.age media.tar.age > SHA256SUMS)

log "uploading to $BACKUP_REMOTE/$stamp"
rclone copy "$tmp" "$BACKUP_REMOTE/$stamp" --error-on-no-transfer
# Compare what is stored off-server with what we made (size + hash).
rclone check "$tmp" "$BACKUP_REMOTE/$stamp" --one-way

# Keep the newest KEEP_MIN backups always, and anything younger than KEEP_DAYS.
# Only reached after a successful upload, so a broken backup never shrinks the history.
cutoff=$(date -u -d "$KEEP_DAYS days ago" +%Y%m%dT%H%M%SZ)
mapfile -t all < <(rclone lsf --dirs-only "$BACKUP_REMOTE" | tr -d '/' | sort)
protected=$(( ${#all[@]} - KEEP_MIN ))
for i in "${!all[@]}"; do
  if [ "$i" -lt "$protected" ] && [[ "${all[$i]}" < "$cutoff" ]]; then
    log "removing old backup ${all[$i]}"
    rclone purge "$BACKUP_REMOTE/${all[$i]}"
  fi
done

mkdir -p "$STATE" 2>/dev/null || true
date -u +%FT%TZ > "$STATE/backup.last-success" 2>/dev/null || true
# Optional dead-man's switch (e.g. healthchecks.io): you are alerted when this stops arriving.
if [ -n "${BACKUP_PING_URL:-}" ]; then curl -fsS --max-time 10 "$BACKUP_PING_URL" >/dev/null || log "ping failed"; fi
log "backup $stamp done"
