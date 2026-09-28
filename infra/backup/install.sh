#!/usr/bin/env bash
# Installs (or refreshes) the daily backup timer. Idempotent; run as root. Does nothing until
# /opt/jordan-sports/backup.env exists. Called by infra/staging/update.sh after every deploy.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
[ -f /opt/jordan-sports/backup.env ] || exit 0
if ! command -v age >/dev/null || ! command -v rclone >/dev/null; then
  apt-get update -q && apt-get install -y -q age rclone
fi
changed=0
write_unit() { # name, content
  if [ "$(cat "/etc/systemd/system/$1" 2>/dev/null || true)" != "$2" ]; then
    printf '%s\n' "$2" > "/etc/systemd/system/$1"; changed=1
  fi
}
write_unit jordan-sports-backup.service "[Unit]
Description=Jorena encrypted off-server backup

[Service]
Type=oneshot
ExecStart=$HERE/backup.sh
StandardOutput=append:/var/log/jordan-sports/backup.log
StandardError=append:/var/log/jordan-sports/backup.log"
write_unit jordan-sports-backup.timer "[Unit]
Description=Daily Jorena backup

[Timer]
OnCalendar=*-*-* 03:15:00 UTC
RandomizedDelaySec=300
Persistent=true

[Install]
WantedBy=timers.target"
if [ "$changed" = 1 ]; then systemctl daemon-reload; fi
systemctl enable --now jordan-sports-backup.timer >/dev/null
