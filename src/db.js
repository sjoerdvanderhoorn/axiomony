import pg from 'pg';
import { config } from './config.js';

// No connection pool using a privileged common account. Each MCP call has
// a fresh connection using the actual user's PostgreSQL credentials.
export async function withDb(credentials, fn) {
  const client = new pg.Client({
    host: config.host,
    port: config.dbPort,
    database: config.database,
    user: credentials.username,
    password: credentials.password,
    ssl: config.ssl,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    query_timeout: 12000,
    application_name: 'axiomony'
  });
  await client.connect();
  try { return await fn(client); }
  finally { await client.end().catch(() => {}); }
}

export async function getIdentity(db) {
  const user = await db.query(`
    SELECT current_user AS username,
      current_database() AS database,
      (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
      OR COALESCE(pg_has_role(current_user, to_regrole('mcp_admin'), 'MEMBER'), false)
      AS is_admin
  `);
  const tables = await db.query(`
    SELECT
      COALESCE(bool_or(has_any_column_privilege(c.oid, 'SELECT')), false) AS can_select,
      COALESCE(bool_or(has_any_column_privilege(c.oid, 'INSERT')), false) AS can_insert,
      COALESCE(bool_or(has_any_column_privilege(c.oid, 'UPDATE')), false) AS can_update,
      COALESCE(bool_or(has_table_privilege(c.oid, 'DELETE')), false) AS can_delete
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p', 'v')
      AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND has_schema_privilege(n.oid, 'USAGE')
  `);
  return { ...user.rows[0], ...tables.rows[0] };
}

const RELATION_SQL = `
  SELECT c.oid, n.nspname AS schema, c.relname AS name, c.relkind,
    obj_description(c.oid, 'pg_class') AS description,
    has_any_column_privilege(c.oid, 'SELECT') AS can_select,
    has_any_column_privilege(c.oid, 'INSERT') AS can_insert,
    has_any_column_privilege(c.oid, 'UPDATE') AS can_update,
    has_table_privilege(c.oid, 'DELETE') AS can_delete
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v')
    AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    AND has_schema_privilege(n.oid, 'USAGE')
`;

export async function listVisibleTables(db) {
  const { rows } = await db.query(`${RELATION_SQL}
    AND (has_any_column_privilege(c.oid, 'SELECT')
      OR has_any_column_privilege(c.oid, 'INSERT')
      OR has_any_column_privilege(c.oid, 'UPDATE')
      OR has_table_privilege(c.oid, 'DELETE'))
    ORDER BY n.nspname, c.relname LIMIT 250`);
  return rows.map(({ oid, ...row }) => row);
}

export async function visibleTable(db, schema, table) {
  const { rows } = await db.query(`${RELATION_SQL}
    AND n.nspname=$1 AND c.relname=$2
    AND (has_any_column_privilege(c.oid, 'SELECT')
      OR has_any_column_privilege(c.oid, 'INSERT')
      OR has_any_column_privilege(c.oid, 'UPDATE')
      OR has_table_privilege(c.oid, 'DELETE'))`, [schema, table]);
  if (!rows.length) throw new Error('Table does not exist or is not accessible.');
  const relation = rows[0];
  const cols = await db.query(`
    SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
      a.attnotnull AS required,
      col_description(a.attrelid, a.attnum) AS description,
      has_column_privilege($1::oid, a.attnum, 'SELECT') AS can_select,
      has_column_privilege($1::oid, a.attnum, 'INSERT') AS can_insert,
      has_column_privilege($1::oid, a.attnum, 'UPDATE') AS can_update
    FROM pg_attribute a
    WHERE a.attrelid=$1::oid AND a.attnum > 0 AND NOT a.attisdropped
      AND (has_column_privilege($1::oid, a.attnum, 'SELECT')
        OR has_column_privilege($1::oid, a.attnum, 'INSERT')
        OR has_column_privilege($1::oid, a.attnum, 'UPDATE'))
    ORDER BY a.attnum`, [relation.oid]);
  return { ...relation, columns: cols.rows };
}

export function publicTableDescription(table) {
  const { oid, ...other } = table;
  return other;
}

export function pgError(error) {
  // Avoid forwarding connection credentials, internals or raw query text to a user.
  if (error?.code === '42501') return 'PostgreSQL denied this operation: insufficient privileges.';
  if (error?.code === '23505') return 'Value already exists (unique constraint).';
  if (error?.code === '23503') return 'This operation violates a foreign key constraint.';
  if (error?.code === '23514') return 'This operation violates a CHECK constraint.';
  if (error?.code === '22001') return 'A supplied value is too long.';
  if (error?.code === '57014') return 'Database-query afgebroken vanwege timeout.';
  if (error?.code === 'P0001') return 'A PostgreSQL business rule rejected this operation.';
  return 'Database operation failed. Check data types, existing rules, and permissions.';
}
