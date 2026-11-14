#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mode=${1:-bundled}
if [ "$mode" != bundled ] && [ "$mode" != external ]; then echo 'Choose bundled|external' >&2; exit 2; fi
if [ ! -f .env ]; then cp .env.example .env; fi
getval() { sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r'; }
HOST=$(getval PGHOST)
PORT=$(getval PGPORT)
DB=$(getval PGDATABASE)
SSL=$(getval PGSSL)
if [ "$mode" = bundled ]; then HOST=postgres-db; PORT=5432; SSL=false; fi
# Limit URI creation to simple, unambiguous values; never eval or source .env.
case "$HOST" in ''|*[!a-zA-Z0-9._-]*) echo 'Invalid PGHOST for REST URI' >&2; exit 1;; esac
case "$PORT" in ''|*[!0-9]*) echo 'Invalid PGPORT for REST URI' >&2; exit 1;; esac
case "$DB" in ''|*[!a-zA-Z0-9_]*) echo 'Invalid PGDATABASE for REST URI (use letters, digits, underscore)' >&2; exit 1;; esac
mkdir -p .local
chmod 700 .local
make_secret() {
  if [ ! -s ".local/$1" ]; then
    umask 077
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n' > ".local/$1"
  fi
}
make_secret pgrst_db_password
make_secret pgrst_jwt_secret
PW=$(cat .local/pgrst_db_password)
URI="postgresql://postgrest_authenticator:${PW}@${HOST}:${PORT}/${DB}"
if [ "$SSL" = true ]; then URI="${URI}?sslmode=require"; fi
umask 077
printf '%s' "$URI" > .local/pgrst_db_uri
# Compose local-file secrets need to be readable inside non-root containers;
# host directory .local remains mode 0700, preventing other host users from traversing.
chmod 644 .local/pgrst_jwt_secret .local/pgrst_db_uri
printf 'REST secrets prepared for %s mode (no admin account credentials stored).\n' "$mode"
