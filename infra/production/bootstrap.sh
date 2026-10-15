#!/usr/bin/env bash
# First-time setup of the PRODUCTION server, from an empty Ubuntu 24.04 VM, in one go.
# Run as root by the production cloud-config (infra/production/cloud-config.template.yaml), which
# writes the owner's settings to /opt/jordan-sports/launch.env and the backup storage config to
# /opt/jordan-sports/rclone.conf. Safe to run again. See docs/production.md.
#
# Unlike staging: no demo data, no staff login in the environment, sign-in codes by SMS, the real
# domain from the start, daily off-server backups, and the server follows the `production` branch.
set -euo pipefail
BASE=/opt/jordan-sports
APP=$BASE/app
LAUNCH=$BASE/launch.env
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=envfile.sh
. "$HERE/envfile.sh"
# shellcheck source=launch-env.sh
. "$HERE/launch-env.sh"
mkdir -p /var/log/jordan-sports
log() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { log "STOPPED: $*"; exit 1; }

if [ ! -f "$BASE/staging.env" ]; then
  log "1/6 launch settings"
  [ -f "$LAUNCH" ] || die "$LAUNCH is missing (paste the filled production cloud-config)"
  check_launch "$LAUNCH" || die "fill the settings above in the cloud-config and rebuild the server"
  [ -n "$(get_env "$LAUNCH" PAYMENT_GATEWAY)" ] ||
    die "PAYMENT_GATEWAY is empty: production takes card payments only through the real gateway (docs/production.md, 'Blocking launch')"
  remote=$(get_env "$LAUNCH" BACKUP_REMOTE); remote=${remote:-offsite:jorena-backups}
  grep -q "^\[${remote%%:*}\]" "$BASE/rclone.conf" 2>/dev/null ||
    die "$BASE/rclone.conf has no [${remote%%:*}] section (backup storage, docs/backups.md)"
  chmod 600 "$BASE/rclone.conf"

  log "2/6 DNS points at this server (needed for the HTTPS certificates)"
  DOMAIN=$(get_env "$LAUNCH" DOMAIN)
  IP=$(curl -fsS --max-time 5 http://169.254.169.254/hetzner/v1/metadata/public-ipv4 || curl -fsS https://api.ipify.org)
  for name in "$DOMAIN" "admin.$DOMAIN" "www.$DOMAIN"; do
    for i in $(seq 1 60); do
      getent ahostsv4 "$name" | awk '{ print $1 }' | grep -qx "$IP" && break
      [ "$i" -lt 60 ] || die "$name does not point at $IP after 30 minutes (docs/domain.md, step 2)"
      log "waiting for $name -> $IP"
      sleep 30
    done
  done

  log "3/6 server settings (secrets generated here; nothing is logged)"
  write_server_env "$LAUNCH" "$BASE/staging.env"
  write_backup_env "$LAUNCH" "$BASE/backup.env"
  echo "DEPLOY_BRANCH=production" > "$BASE/deploy.env"
  # The values now live in the env files above; no third copy stays on disk.
  shred -u "$LAUNCH" 2>/dev/null || rm -f "$LAUNCH"
else
  log "1-3/6 settings already exist, keeping them"
fi

log "4/6 swap, docker, build and start (shared with staging; first build takes 10-20 minutes)"
BRANCH=production bash "$APP/infra/staging/bootstrap.sh"

log "5/6 daily backups"
"$APP/infra/backup/install.sh"

log "6/6 first checks"
WEB_HOST=$(get_env "$BASE/staging.env" WEB_HOST)
for i in $(seq 1 80); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "https://$WEB_HOST/api/readyz")" = 200 ] && break
  [ "$i" -lt 80 ] || die "the API is not ready after 20 minutes: cd $APP/infra/staging && docker compose logs api"
  sleep 15
done
systemctl start jordan-sports-backup.service || die "the first backup failed: /var/log/jordan-sports/backup.log"
# go-live.sh --check also needs the owner's staff account, which only the owner creates (next step).
log "done: https://$WEB_HOST is up and backed up."
log "next: the owner account, then go-live.sh --check (docs/production.md, 'After the server is up')"
