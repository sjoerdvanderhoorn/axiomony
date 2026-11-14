#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "$#" -ne 1 ]; then echo 'Usage: ./scripts/bootstrap-external-rest.sh YOUR_POSTGRES_DBA_USERNAME' >&2; exit 2; fi
./scripts/prepare-rest-secrets.sh external
getval() { sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r'; }
HOST=$(getval PGHOST)
PORT=$(getval PGPORT)
DB=$(getval PGDATABASE)
printf '\nOne-off connection as DBA %s to %s:%s/%s.\n' "$1" "$HOST" "$PORT" "$DB"
printf 'psql will prompt for the DBA password, which is NOT saved in .env.\n'
# This one-time role creation connects directly to PostgreSQL. No admin
# credentials are stored by the MCP service. The only service account is
# postgrest_authenticator, created with NOINHERIT and no data grants.
docker run --rm -it \
  --add-host=host.docker.internal:host-gateway \
  -v "$(pwd)/bundled/02-rest-init.sh:/bootstrap.sh:ro" \
  -v "$(pwd)/.local/pgrst_db_password:/run/secrets/pgrst_db_password:ro" \
  -e "PGHOST=$HOST" -e "PGPORT=$PORT" \
  -e "POSTGRES_USER=$1" -e "POSTGRES_DB=$DB" \
  postgres:17-alpine sh /bootstrap.sh
printf '\nNow grant individual employees: GRANT employee TO postgrest_authenticator WITH INHERIT FALSE, SET TRUE;\n'
