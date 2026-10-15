#!/usr/bin/env bash
# Tests launch-env.sh (run locally: bash infra/production/test-launch-env.sh).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=envfile.sh
. "$HERE/envfile.sh"
# shellcheck source=launch-env.sh
. "$HERE/launch-env.sh"
dir=$(mktemp -d); trap 'rm -rf "$dir"' EXIT
check() { [ "$1" = "$2" ] || { echo "FAIL: expected [$2] got [$1]"; exit 1; }; }

# Placeholders and missing values are refused, and named.
printf 'DOMAIN=CHANGE-ME\nRELEANS_API_KEY=\nSMTP_URL=smtps://u:p@mail.example:465\nBACKUP_AGE_RECIPIENT=nope\n' > "$dir/bad"
if out=$(check_launch "$dir/bad"); then echo "FAIL: accepted placeholders"; exit 1; fi
case $out in *DOMAIN*RELEANS_API_KEY*age1*) ;; *) echo "FAIL: unclear refusal: $out"; exit 1 ;; esac
printf 'DOMAIN=https://jorena.app\nRELEANS_API_KEY=k123456789\nSMTP_URL=smtps://x\nBACKUP_AGE_RECIPIENT=age1abc\n' > "$dir/url"
if check_launch "$dir/url" >/dev/null; then echo "FAIL: accepted a URL as DOMAIN"; exit 1; fi

cat > "$dir/launch" <<'L'
DOMAIN=jorena.app
RELEANS_API_KEY=k&e/y$1234567890
RELEANS_SENDER_ID=
SMTP_URL=smtps://user:p%40ss@mail.example:465
BACKUP_AGE_RECIPIENT=age1qqqqexample
BACKUP_PING_URL=https://hc-ping.com/abc
L
check_launch "$dir/launch" >/dev/null

write_server_env "$dir/launch" "$dir/server.env"
check "$(get_env "$dir/server.env" STAGING)" false
check "$(get_env "$dir/server.env" OTP_CHANNEL)" releans
check "$(get_env "$dir/server.env" WEB_ORIGINS)" https://jorena.app
check "$(get_env "$dir/server.env" ADMIN_ORIGINS)" https://admin.jorena.app
check "$(get_env "$dir/server.env" WEB_REDIRECT_HOSTS)" www.jorena.app
check "$(get_env "$dir/server.env" X_ROBOTS_TAG)" all
check "$(get_env "$dir/server.env" RELEANS_API_KEY)" 'k&e/y$1234567890'   # copied verbatim
check "$(grep -c '^RELEANS_SENDER_ID=' "$dir/server.env")" 0               # empty: left out
check "$(grep -cE '^ADMIN_(EMAIL|PASSWORD|TOTP_SECRET)=' "$dir/server.env")" 0  # no staff login
check "$(grep -c '^GOOGLE_PLACES_API_KEY=' "$dir/server.env")" 0           # optional, not given
check "$(get_env "$dir/server.env" AUTH_SECRET | wc -c)" 65                # 64 hex + newline
db=$(get_env "$dir/server.env" POSTGRES_PASSWORD)
check "$(get_env "$dir/server.env" DATABASE_URL)" "postgres://jordan_sports:$db@postgres:5432/jordan_sports"
check "$(stat -c %a "$dir/server.env")" 600

write_backup_env "$dir/launch" "$dir/backup.env"
check "$(get_env "$dir/backup.env" BACKUP_REMOTE)" offsite:jorena-backups
check "$(get_env "$dir/backup.env" BACKUP_AGE_RECIPIENT)" age1qqqqexample
check "$(get_env "$dir/backup.env" BACKUP_PING_URL)" https://hc-ping.com/abc
check "$(stat -c %a "$dir/backup.env")" 600
echo "launch env OK"
