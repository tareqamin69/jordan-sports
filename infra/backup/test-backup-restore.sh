#!/usr/bin/env bash
# End-to-end check of backup.sh and restore.sh against a local PostgreSQL (PG_MODE=url):
# a real backup with a throwaway key, off-server upload to a local folder, tamper / wrong-key
# refusal, retention, and a full restore compared table by table.
#   PGURL=postgres://user:pass@127.0.0.1:5432/jordan_sports infra/backup/test-backup-restore.sh
# Needs pg_dump, pg_restore, psql, age, rclone.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
export PG_MODE=url
: "${PGURL:?set PGURL to the source database}"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
work=$(mktemp -d)
scratch=jorena_restore_test_$$
export MEDIA_DIR=$work/media BACKUP_ENV=/nonexistent BACKUP_STATE_DIR=$work/state
trap 'echo "DROP DATABASE IF EXISTS $scratch;" | db_admin_sql; rm -rf "$work"' EXIT
pass() { echo "ok - $*"; }

mkdir -p "$MEDIA_DIR/venue-a"
head -c 5000 /dev/urandom > "$MEDIA_DIR/venue-a/photo1.webp"
head -c 3000 /dev/urandom > "$MEDIA_DIR/photo2.webp"
age-keygen -o "$work/key.txt" 2>/dev/null
age-keygen -o "$work/other-key.txt" 2>/dev/null
export BACKUP_AGE_RECIPIENT
BACKUP_AGE_RECIPIENT=$(age-keygen -y "$work/key.txt")
export BACKUP_REMOTE=":local:$work/offsite"

# 1. Nothing is uploaded when the source is unreachable.
if PGURL=postgres://nobody@127.0.0.1:1/none "$HERE/backup.sh" >/dev/null 2>&1; then echo "FAIL: backup of an unreachable database succeeded"; exit 1; fi
[ ! -d "$work/offsite" ] || [ -z "$(ls -A "$work/offsite")" ] || { echo "FAIL: partial upload left behind"; exit 1; }
pass "a failed dump uploads nothing"

# 2. Backup, and it left a success marker.
"$HERE/backup.sh" >/dev/null
[ -f "$work/state/backup.last-success" ]
mapfile -t dirs < <(ls "$work/offsite")
[ ${#dirs[@]} -eq 1 ]
first=${dirs[0]}
ls "$work/offsite/$first" | sort | tr '\n' ' ' | grep -q "SHA256SUMS db.dump.age media.tar.age" || { echo "FAIL: unexpected files"; exit 1; }
pass "backup uploaded ($first)"

# 3. Stored data is encrypted: no plaintext table names or file bytes.
if grep -qa "CREATE TABLE\|PGDMP" "$work/offsite/$first/db.dump.age"; then echo "FAIL: dump is not encrypted"; exit 1; fi
pass "backup files are encrypted"

# 4. Full restore into a scratch database, compared with the source.
"$HERE/restore.sh" --identity "$work/key.txt" --from ":local:$work/offsite" --target-db "$scratch" --media-dir "$work/restored-media" | tail -1
diff <(table_counts "${PGURL##*/}") <(table_counts "$scratch") >/dev/null || { echo "FAIL: row counts differ"; diff <(table_counts "${PGURL##*/}") <(table_counts "$scratch"); exit 1; }
diff -r "$MEDIA_DIR" "$work/restored-media" >/dev/null || { echo "FAIL: photos differ"; exit 1; }
[ "$(table_counts "$scratch" | wc -l)" -gt 20 ] || { echo "FAIL: too few tables restored"; exit 1; }
pass "restore matches the source ($(table_counts "$scratch" | wc -l) tables, all row counts and photos identical)"

# 5. Safety rails.
if "$HERE/restore.sh" --identity "$work/key.txt" --from ":local:$work/offsite" --target-db "$scratch" >/dev/null 2>&1; then echo "FAIL: overwrote an existing database"; exit 1; fi
pass "refuses to overwrite an existing database"
if POSTGRES_DB="${PGURL##*/}" "$HERE/restore.sh" --identity "$work/key.txt" --from ":local:$work/offsite" --target-db "${PGURL##*/}" >/dev/null 2>&1; then echo "FAIL: restored over the live database"; exit 1; fi
pass "refuses to restore over the live database"
if "$HERE/restore.sh" --identity "$work/other-key.txt" --from ":local:$work/offsite" --target-db "${scratch}_b" >/dev/null 2>&1; then echo "FAIL: wrong key accepted"; exit 1; fi
if db_exists "${scratch}_b"; then echo "FAIL: a wrong key left a database behind"; exit 1; fi
pass "a wrong key cannot open the backup, and leaves nothing behind"
cp -r "$work/offsite/$first" "$work/tampered"
printf 'X' | dd of="$work/tampered/db.dump.age" bs=1 seek=100 conv=notrunc 2>/dev/null
if "$HERE/restore.sh" --identity "$work/key.txt" --from "$work/tampered" --target-db "${scratch}_c" >/dev/null 2>&1; then echo "FAIL: tampered backup accepted"; exit 1; fi
if db_exists "${scratch}_c"; then echo "FAIL: a tampered backup created a database"; exit 1; fi
pass "a damaged backup is refused before anything is restored"

# 6. Retention. Old backups go; the newest KEEP_MIN always stay; a failed run never prunes.
add_old() { for old in 20250101T000000Z 20250102T000000Z 20250103T000000Z; do cp -r "$work/offsite/$first" "$work/offsite/$old"; done; }
add_old
BACKUP_KEEP_MIN=2 BACKUP_KEEP_DAYS=30 "$HERE/backup.sh" >/dev/null
mapfile -t left < <(ls "$work/offsite")
[ ${#left[@]} -eq 2 ] || { echo "FAIL: expected only the 2 recent backups, got ${left[*]}"; exit 1; }
[[ "${left[0]}" > 2026 ]] || { echo "FAIL: an old backup survived"; exit 1; }
add_old
BACKUP_KEEP_MIN=4 BACKUP_KEEP_DAYS=30 "$HERE/backup.sh" >/dev/null
mapfile -t left < <(ls "$work/offsite")
[ ${#left[@]} -eq 4 ] || { echo "FAIL: expected the newest 4 to be protected, got ${left[*]}"; exit 1; }
[[ " ${left[*]} " == *" 20250103T000000Z "* && " ${left[*]} " != *" 20250101T000000Z "* ]] || { echo "FAIL: wrong backups pruned: ${left[*]}"; exit 1; }
before=$(ls "$work/offsite" | wc -l)
PGURL=postgres://nobody@127.0.0.1:1/none BACKUP_KEEP_MIN=0 "$HERE/backup.sh" >/dev/null 2>&1 || true
[ "$(ls "$work/offsite" | wc -l)" -eq "$before" ] || { echo "FAIL: a failed backup pruned history"; exit 1; }
pass "retention prunes old backups, protects the newest, and never prunes after a failure"
echo "ALL BACKUP TESTS PASSED"
