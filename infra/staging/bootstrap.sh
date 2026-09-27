#!/usr/bin/env bash
# First-time setup of a staging server (Ubuntu). Run as root; safe to run again.
# Expects /opt/jordan-sports/admin.env (ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_TOTP_SECRET), written
# by the cloud-config the owner pastes when creating the server. See docs/staging.md.
set -euo pipefail
BASE=/opt/jordan-sports
APP=$BASE/app
BRANCH=${BRANCH:-claude/inspect-repo-environment-c0iptd}
mkdir -p /var/log/jordan-sports
log() { echo "[$(date -u +%H:%M:%S)] $*"; }

log "1/6 swap (the build needs memory)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "2/6 docker"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

log "3/6 code"
[ -d "$APP/.git" ] || git clone --branch "$BRANCH" https://github.com/tareqamin69/jordan-sports.git "$APP"

log "4/6 settings"
if [ ! -f "$BASE/staging.env" ]; then
  IP=$(curl -fsS --max-time 5 http://169.254.169.254/hetzner/v1/metadata/public-ipv4 || curl -fsS https://api.ipify.org)
  DASHED=${IP//./-}
  DB_PASSWORD=$(openssl rand -hex 24)
  # shellcheck disable=SC1091
  source "$BASE/admin.env"
  umask 077
  cat > "$BASE/staging.env" <<ENV
NODE_ENV=production
STAGING=true
WEB_HOST=$DASHED.sslip.io
ADMIN_HOST=admin.$DASHED.sslip.io
WEB_BASE_URL=https://$DASHED.sslip.io
WEB_ORIGINS=https://$DASHED.sslip.io
ADMIN_ORIGINS=https://admin.$DASHED.sslip.io
COOKIE_SECURE=true
OTP_CHANNEL=console
API_HOST=0.0.0.0
API_INTERNAL_URL=http://api:4000
TRUST_PROXY=127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
POSTGRES_USER=jordan_sports
POSTGRES_DB=jordan_sports
POSTGRES_PASSWORD=$DB_PASSWORD
DATABASE_URL=postgres://jordan_sports:$DB_PASSWORD@postgres:5432/jordan_sports
REDIS_URL=redis://redis:6379
AUTH_SECRET=$(openssl rand -hex 32)
MEDIA_DIR=/data/media
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_TOTP_SECRET=$ADMIN_TOTP_SECRET
ENV
fi

log "5/6 start (first build takes 10-20 minutes)"
cd "$APP/infra/staging"
docker compose up -d caddy
docker compose up -d --build
docker image prune -f >/dev/null

log "6/6 automatic updates every 5 minutes"
echo "*/5 * * * * root $APP/infra/staging/update.sh >> /var/log/jordan-sports/update.log 2>&1" > /etc/cron.d/jordan-sports
log "done: https://$(grep ^WEB_HOST "$BASE/staging.env" | cut -d= -f2)"
