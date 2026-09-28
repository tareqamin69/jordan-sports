#!/usr/bin/env bash
# Pulls the staging branch and redeploys when it changed (systemd timer, every 5 minutes).
set -euo pipefail
APP=/opt/jordan-sports/app
BRANCH=${BRANCH:-claude/inspect-repo-environment-c0iptd}
exec 9>/tmp/jordan-sports-update.lock
flock -n 9 || exit 0
cd "$APP"
git fetch -q origin "$BRANCH"
if [ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH")" ]; then exit 0; fi
echo "[$(date -u +%FT%TZ)] deploying $(git rev-parse --short "origin/$BRANCH")"
git reset -q --hard "origin/$BRANCH"
cd infra/staging
docker compose up -d --build --remove-orphans
# The Caddyfile is a bind mount: Compose doesn't notice when only its contents change.
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile ||
  echo "[$(date -u +%FT%TZ)] caddy reload failed (the previous proxy configuration stays active)"
# Daily off-server backup timer (only once /opt/jordan-sports/backup.env exists; docs/backups.md).
"$APP/infra/backup/install.sh" || echo "[$(date -u +%FT%TZ)] backup timer install failed"
docker image prune -f >/dev/null
echo "[$(date -u +%FT%TZ)] deployed"
