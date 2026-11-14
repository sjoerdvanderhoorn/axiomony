#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -f .local/postgres_bootstrap_password ]; then
  echo 'No bundled credentials found. Run ./scripts/start.sh bundled first.' >&2
  exit 1
fi
printf 'PostgreSQL user: platform_admin\n'
printf 'PostgreSQL password: '
cat .local/postgres_bootstrap_password
printf '\n'
