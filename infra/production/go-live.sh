#!/usr/bin/env bash
# Switches the server from staging to production mode, or (--check) only verifies it is ready.
# Run as root on the server. Read docs/production.md first; this deletes the demo data.
#   go-live.sh --check
#   go-live.sh --test-phone +9627XXXXXXXX
set -euo pipefail
BASE=/opt/jordan-sports
APP=$BASE/app
ENVF=$BASE/staging.env
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=envfile.sh
. "$HERE/envfile.sh"
cd "$APP/infra/staging"

check_only=0 phone=
while [ $# -gt 0 ]; do
  case $1 in
    --check) check_only=1; shift ;;
    --test-phone) phone=$2; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
say() { echo; echo "== $*"; }
die() { echo "STOPPED: $*" >&2; exit 1; }
# stdin from /dev/null: exec would otherwise swallow the answers typed at the prompts below.
api() { docker compose exec -T api "$@" </dev/null; }
ask() { local a; read -r -p "$1 " a; [ "$a" = "$2" ] || die "not confirmed"; }

verify() {
  say "Preflight: configuration and data"
  api node dist/cli/preflight.js
  say "From outside: what a visitor can see"
  local host base page
  host=$(get_env "$ENVF" WEB_HOST); [ -n "$host" ] || die "WEB_HOST is not set"
  base=https://$host
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$base/api/v1/dev/otp?phone=%2B962790000001")" = 404 ] \
    || die "the developer sign-in-code endpoint answers publicly"
  # Not `curl | grep -q`: grep exits early, curl dies of SIGPIPE, and pipefail hides the match.
  page=$(curl -fsS "$base/en/sign-in") || die "cannot load $base/en/sign-in"
  case $page in *"codes are not sent by SMS"*) die "the sign-in page still shows the test-code notice" ;; esac
  echo "PASS  no sign-in code endpoint, no on-screen code"
  local last
  last=$(cat /var/log/jordan-sports/backup.last-success 2>/dev/null || true)
  [ -n "$last" ] || die "no successful backup yet (docs/backups.md)"
  [ $(( $(date +%s) - $(date -d "$last" +%s) )) -lt 129600 ] || die "the last backup ($last) is older than 36 hours"
  echo "PASS  last backup $last"
}

if [ "$check_only" = 1 ]; then verify; echo; echo "READY"; exit 0; fi

say "Prerequisites"
[ -f "$BASE/backup.env" ] || die "$BASE/backup.env is missing (docs/backups.md)"
[ -f "$BASE/releans.env" ] || die "$BASE/releans.env is missing: it needs RELEANS_API_KEY=... and optionally RELEANS_SENDER_ID=..."
[ -n "$(get_env "$BASE/releans.env" RELEANS_API_KEY)" ] || die "RELEANS_API_KEY is empty in releans.env"
grep -q '^WEB_HOST=' "$APP/infra/staging/domain.env" || die "the real domain is not switched on in infra/staging/domain.env (docs/domain.md)"
[ -n "$phone" ] || die "give a phone you can read: --test-phone +9627XXXXXXXX"
git -C "$APP" fetch -q origin production 2>/dev/null ||
  die "there is no 'production' branch yet; create it first (docs/releases.md)"

say "1/6 Backup first (a safety net before anything is deleted)"
"$APP/infra/backup/backup.sh"

say "2/6 The SMS gateway works"
docker compose run --rm -T --no-deps \
  -e RELEANS_API_KEY="$(get_env "$BASE/releans.env" RELEANS_API_KEY)" \
  -e RELEANS_SENDER_ID="$(get_env "$BASE/releans.env" RELEANS_SENDER_ID)" \
  api node dist/cli/sms-test.js "$phone"
ask "Did the test SMS arrive on $phone? (type yes)" yes

say "3/6 Demo data that will be deleted"
api node dist/cli/remove-demo.js --all-players
ask "Delete all of that permanently? (type DELETE)" DELETE
api node dist/cli/remove-demo.js --yes --all-players

say "4/6 Production mode (settings copy saved as staging.env.before-golive)"
cp -p "$ENVF" "$ENVF.before-golive"
set_env "$ENVF" STAGING false
set_env "$ENVF" OTP_CHANNEL releans
set_env "$ENVF" RELEANS_API_KEY "$(get_env "$BASE/releans.env" RELEANS_API_KEY)"
set_env "$ENVF" RELEANS_SENDER_ID "$(get_env "$BASE/releans.env" RELEANS_SENDER_ID || true)"
[ -n "$(get_env "$ENVF" RELEANS_SENDER_ID)" ] || del_env "$ENVF" RELEANS_SENDER_ID
# The staging staff login is not kept in the environment of every container.
for k in ADMIN_EMAIL ADMIN_PASSWORD ADMIN_TOTP_SECRET; do del_env "$ENVF" "$k"; done

# From now on this server only follows the branch the owner moves on purpose (docs/releases.md).
echo "DEPLOY_BRANCH=production" > "$BASE/deploy.env"

say "5/6 Restart in production mode"
docker compose up -d --force-recreate
for i in $(seq 1 60); do
  api node -e "fetch('http://127.0.0.1:4000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && break
  [ "$i" -lt 60 ] || die "the API did not become ready; the old settings are in $ENVF.before-golive"
  sleep 5
done

say "6/6 Verify"
verify
echo
echo "LIVE. Staging mode is off, demo data is gone, sign-in codes go out by SMS."
echo "To roll back the settings: cp -p $ENVF.before-golive $ENVF && cd $APP/infra/staging && docker compose up -d --force-recreate (deleted demo data does not come back)."
