#!/usr/bin/env bash
# Safe KEY=VALUE editing of an env file (values may contain / & \ $ and other characters that
# break sed). Source this file; see test-envfile.sh.

# set_env FILE KEY VALUE: replaces the line for KEY, or appends it.
set_env() {
  local file=$1 key=$2 value=$3 tmp
  tmp=$(mktemp)
  KEY=$key VALUE=$value awk 'BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VALUE"]; done = 0 }
    index($0, k "=") == 1 { if (!done) { print k "=" v; done = 1 } ; next }
    { print }
    END { if (!done) print k "=" v }' "$file" > "$tmp"
  cat "$tmp" > "$file"; rm -f "$tmp"
}

# del_env FILE KEY: removes the line for KEY.
del_env() {
  local file=$1 key=$2 tmp
  tmp=$(mktemp)
  KEY=$key awk 'BEGIN { k = ENVIRON["KEY"] } index($0, k "=") != 1 { print }' "$file" > "$tmp"
  cat "$tmp" > "$file"; rm -f "$tmp"
}

# get_env FILE KEY: prints the value (empty if missing).
get_env() {
  KEY=$2 awk 'BEGIN { k = ENVIRON["KEY"] } index($0, k "=") == 1 { print substr($0, length(k) + 2); exit }' "$1"
}
