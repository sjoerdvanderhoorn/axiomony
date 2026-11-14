#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mode=${1:-bundled}
if [ "$mode" != bundled ] && [ "$mode" != external ]; then
  echo 'Usage: ./scripts/start.sh [bundled|external]' >&2
  exit 2
fi
if [ ! -f .env ]; then
  cp .env.example .env
  echo 'Created .env from .env.example. Check PGDATABASE and REST settings.'
fi
# Include optional static-site hosting only when explicitly enabled in .env.
# Keep it separate so a default install starts no Nginx or published-sites volume.
set -- -f compose.yml
if [ "$mode" = bundled ]; then
  set -- "$@" -f compose.bundled.yml
else
  set -- "$@" -f compose.rest.yml
fi
hosting_enabled=false
if grep -Eq '^[[:space:]]*APP_HOSTING_ENABLED[[:space:]]*=[[:space:]]*true[[:space:]]*$' .env; then
  hosting_enabled=true
fi
if [ "$hosting_enabled" = true ]; then
  set -- "$@" -f compose.hosting.yml
fi
if [ "$mode" = bundled ]; then
  mkdir -p .local
  chmod 700 .local
  if [ ! -s .local/postgres_bootstrap_password ]; then
    umask 077
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n' > .local/postgres_bootstrap_password
    chmod 600 .local/postgres_bootstrap_password
    echo 'Generated bundled PostgreSQL bootstrap password.'
  fi
  ./scripts/prepare-rest-secrets.sh bundled
  # Start database before REST and ensure REST login role exists even with old volumes.
  docker compose -f compose.yml -f compose.bundled.yml up -d postgres-db
  docker compose -f compose.yml -f compose.bundled.yml exec -T postgres-db sh /docker-entrypoint-initdb.d/02-rest-init.sh
  # The REST service is part of the existing v0.4 compatibility setup.
  # Append it, keeping the optional hosting file as the final override.
  set -- -f compose.yml -f compose.bundled.yml -f compose.rest.yml
  if [ "$hosting_enabled" = true ]; then set -- "$@" -f compose.hosting.yml; fi
  docker compose "$@" up -d --build --remove-orphans
  printf '\nBundled PostgreSQL admin username: platform_admin\n'
  printf 'Show its password: ./scripts/show-credentials.sh\n'
else
  if [ ! -s .local/pgrst_db_uri ] || [ ! -s .local/pgrst_jwt_secret ]; then
    echo 'External REST bootstrap required: ./scripts/bootstrap-external-rest.sh POSTGRES_DBA_USERNAME' >&2
    exit 1
  fi
  # Rebuild the URI if a host/database setting was adjusted; not the actual DB roles.
  ./scripts/prepare-rest-secrets.sh external
  docker compose "$@" up -d --build --remove-orphans
  printf '\nExternal database: PGHOST/PGPORT/PGDATABASE from .env\n'
fi
printf 'MCP:          http://127.0.0.1:3000/mcp\n'
printf 'REST login:   http://127.0.0.1:3000/auth/token\n'
printf 'REST API:     http://127.0.0.1:3001/\n'
printf 'Health:       http://127.0.0.1:3000/health\n'
if [ "$hosting_enabled" = true ]; then
  app_url=$(sed -n 's/^APP_PUBLIC_URL=//p' .env | tail -n 1 | tr -d '\r')
  printf 'Apps:         %s/apps/<database-user>/<project>/index.html\n' "${app_url:-http://localhost:8088}"
fi
