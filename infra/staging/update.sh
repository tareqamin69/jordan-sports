#!/usr/bin/env bash
# Pulls the staging branch and redeploys when it changed (run by cron every 5 minutes).
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
docker image prune -f >/dev/null
echo "[$(date -u +%FT%TZ)] deployed"
