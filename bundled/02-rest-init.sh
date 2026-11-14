#!/bin/sh
set -eu
# Idempotent init. Also executable later on pre-existing volumes via docker compose exec.
PW=$(cat /run/secrets/pgrst_db_password)
psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-platform_admin}" -d "${POSTGRES_DB:-postgres}" -v pgrst_pw="$PW" <<'SQL'
SELECT 'CREATE ROLE postgrest_authenticator LOGIN NOINHERIT'
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='postgrest_authenticator') \gexec
SELECT 'CREATE ROLE web_anon NOLOGIN'
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='web_anon') \gexec
-- Must never attach REST tokens to a privileged authenticator account.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='postgrest_authenticator'
    AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)) THEN
    RAISE EXCEPTION 'Refusing to use privileged postgrest_authenticator role';
  END IF;
END $$;
ALTER ROLE postgrest_authenticator WITH LOGIN NOINHERIT PASSWORD :'pgrst_pw';
GRANT web_anon TO postgrest_authenticator WITH INHERIT FALSE, SET TRUE;
-- Do not grant any business tables to the anonymous role or authenticator.
-- Enable selected login users explicitly, e.g.
-- GRANT medewerker TO postgrest_authenticator WITH INHERIT FALSE, SET TRUE;
SQL
