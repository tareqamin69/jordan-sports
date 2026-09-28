#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=envfile.sh
. "$HERE/envfile.sh"
f=$(mktemp); trap 'rm -f "$f"' EXIT
printf 'A=1\nSTAGING=true\nOTP_CHANNEL=console\nADMIN_PASSWORD=secret\nSTAGING_X=keep\n# note\n' > "$f"
check() { [ "$1" = "$2" ] || { echo "FAIL: expected [$2] got [$1]"; exit 1; }; }

set_env "$f" STAGING false
check "$(get_env "$f" STAGING)" false
check "$(get_env "$f" STAGING_X)" keep          # a longer key sharing the prefix is untouched
set_env "$f" NEW_KEY 'ab/c&d\e$f "q" 'x
check "$(get_env "$f" NEW_KEY)" 'ab/c&d\e$f "q" x'   # tricky characters survive
set_env "$f" NEW_KEY again
check "$(grep -c '^NEW_KEY=' "$f")" 1                 # replaced, not duplicated
del_env "$f" ADMIN_PASSWORD
check "$(grep -c '^ADMIN_PASSWORD' "$f")" 0
check "$(get_env "$f" A)" 1
check "$(grep -c '^# note$' "$f")" 1                  # comments kept
set_env "$f" KEY_WITH_EMPTY ''
check "$(get_env "$f" KEY_WITH_EMPTY)" ''
echo "env file editing OK"
