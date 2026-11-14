import { createHash } from 'node:crypto';

// Inspect actual pg_catalog objects. There is intentionally no independent
// JSON permissions database or application schema registry.
export async function inspectSchema(db) {
  const tables = (await db.query(`
    SELECT c.oid, n.nspname AS schema, c.relname AS table,
      pg_get_userbyid(c.relowner) AS owner,
      c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
      obj_description(c.oid, 'pg_class') AS description
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p', 'v')
      AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    ORDER BY n.nspname, c.relname LIMIT 250
  `)).rows;
  const all = [];
  for (const t of tables) {
    const [columns, constraints, policies, triggers, grants, columnGrants] = await Promise.all([
      db.query(`SELECT attname AS name, format_type(atttypid, atttypmod) AS type,
        attnotnull AS not_null,
        pg_get_expr(adbin, adrelid) AS default,
        col_description(a.attrelid, a.attnum) AS description
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [t.oid]),
      db.query(`SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conrelid=$1 ORDER BY conname`, [t.oid]),
      db.query(`SELECT policyname AS name, roles, cmd, qual, with_check
        FROM pg_policies WHERE schemaname=$1 AND tablename=$2 ORDER BY policyname`, [t.schema, t.table]),
      db.query(`SELECT tgname AS name, pg_get_triggerdef(g.oid) AS definition,
        pg_get_functiondef(p.oid) AS function_definition
        FROM pg_trigger g JOIN pg_proc p ON p.oid=g.tgfoid
        WHERE g.tgrelid=$1 AND NOT g.tgisinternal ORDER BY g.tgname`, [t.oid]),
      db.query(`SELECT CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
        acl.privilege_type, acl.is_grantable
        FROM pg_class c
        CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
        LEFT JOIN pg_roles grantee ON grantee.oid=acl.grantee
        WHERE c.oid=$1 ORDER BY grantee, acl.privilege_type`, [t.oid]),
      db.query(`SELECT a.attname AS column, CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,
        acl.privilege_type, acl.is_grantable
        FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) acl
        LEFT JOIN pg_roles r ON r.oid=acl.grantee
        WHERE a.attrelid=$1 AND a.attnum>0 ORDER BY a.attnum, grantee`, [t.oid])
    ]);
    const { oid, ...table } = t;
    all.push({ ...table, columns: columns.rows, constraints: constraints.rows,
      policies: policies.rows, triggers: triggers.rows,
      table_grants: grants.rows, column_grants: columnGrants.rows });
  }
  const roles = (await db.query(`SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin
    FROM pg_roles WHERE rolname NOT LIKE 'pg_%' ORDER BY rolname LIMIT 200`)).rows;
  const schemas = (await db.query(`SELECT nspname AS name, pg_get_userbyid(nspowner) AS owner
    FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
    ORDER BY nspname LIMIT 100`)).rows;
  return { database: (await db.query('SELECT current_database() AS database')).rows[0].database,
    schemas, roles, tables: all };
}

export function fingerprint(snapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}
