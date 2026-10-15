#!/usr/bin/env bash
# Turns the owner's launch settings (/opt/jordan-sports/launch.env, written by the production
# cloud-config) into the server env files. Source this file; see test-launch-env.sh.
# Nothing here prints a secret.

# Settings the owner must provide (docs/production.md, "What you provide").
LAUNCH_REQUIRED=(DOMAIN RELEANS_API_KEY SMTP_URL BACKUP_AGE_RECIPIENT)

# check_launch FILE: prints the missing or placeholder settings; fails if there are any.
check_launch() {
  local file=$1 key value missing=()
  for key in "${LAUNCH_REQUIRED[@]}"; do
    value=$(get_env "$file" "$key")
    if [ -z "$value" ] || [[ $value == *CHANGE-ME* ]]; then missing+=("$key"); fi
  done
  value=$(get_env "$file" BACKUP_AGE_RECIPIENT)
  if [ -n "$value" ] && [[ $value != age1* ]]; then missing+=("BACKUP_AGE_RECIPIENT (must start with age1)"); fi
  value=$(get_env "$file" DOMAIN)
  if [[ $value == *://* || $value == */* ]]; then missing+=("DOMAIN (a bare name like jorena.app)"); fi
  if [ ${#missing[@]} -gt 0 ]; then
    printf 'missing or placeholder: %s\n' "${missing[@]}"
    return 1
  fi
}

# write_server_env LAUNCH_FILE OUT_FILE: the production env file the containers load. Random
# secrets (database password, AUTH_SECRET) are generated here and never leave the server.
write_server_env() {
  local launch=$1 out=$2 domain db_password optional key value
  domain=$(get_env "$launch" DOMAIN)
  db_password=$(openssl rand -hex 24)
  (
    umask 077
    cat > "$out" <<ENV
NODE_ENV=production
STAGING=false
WEB_HOST=$domain
ADMIN_HOST=admin.$domain
WEB_REDIRECT_HOSTS=www.$domain
WEB_BASE_URL=https://$domain
WEB_ORIGINS=https://$domain
ADMIN_ORIGINS=https://admin.$domain
X_ROBOTS_TAG=all
COOKIE_SECURE=true
OTP_CHANNEL=releans
API_HOST=0.0.0.0
API_INTERNAL_URL=http://api:4000
TRUST_PROXY=127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
POSTGRES_USER=jordan_sports
POSTGRES_DB=jordan_sports
POSTGRES_PASSWORD=$db_password
DATABASE_URL=postgres://jordan_sports:$db_password@postgres:5432/jordan_sports
REDIS_URL=redis://redis:6379
AUTH_SECRET=$(openssl rand -hex 32)
MEDIA_DIR=/data/media
ENV
  )
  # Copied only when the owner gave them.
  optional=(RELEANS_API_KEY RELEANS_SENDER_ID SMTP_URL EMAIL_FROM GOOGLE_PLACES_API_KEY
    GOOGLE_PLACES_DAILY_CAP PAYMENT_GATEWAY)
  for key in "${optional[@]}"; do
    value=$(get_env "$launch" "$key")
    if [ -n "$value" ]; then set_env "$out" "$key" "$value"; fi
  done
  chmod 600 "$out"
}

# write_backup_env LAUNCH_FILE OUT_FILE: config for infra/backup (public key only).
write_backup_env() {
  local launch=$1 out=$2
  (
    umask 077
    cat > "$out" <<ENV
BACKUP_REMOTE=$(get_env "$launch" BACKUP_REMOTE)
RCLONE_CONFIG=/opt/jordan-sports/rclone.conf
BACKUP_AGE_RECIPIENT=$(get_env "$launch" BACKUP_AGE_RECIPIENT)
BACKUP_KEEP_DAYS=30
BACKUP_KEEP_MIN=7
BACKUP_PING_URL=$(get_env "$launch" BACKUP_PING_URL)
ENV
  )
  [ -n "$(get_env "$out" BACKUP_REMOTE)" ] || set_env "$out" BACKUP_REMOTE offsite:jorena-backups
  chmod 600 "$out"
}
