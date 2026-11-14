import { createWhere, quoteIdent } from './queryBuilder.js';

// Read-only, conservative permission analysis. Never run a trial INSERT/UPDATE/
// DELETE: even a rolled-back transaction can have external trigger side effects.
// All catalog inspection and optional read-only row probing use the caller's
// own PostgreSQL connection (never a service/admin role).
const PRIVILEGE = { select: 'SELECT', insert: 'INSERT', update: 'UPDATE', delete: 'DELETE' };

function relevantPolicy(policy, action) {
  return policy.cmd === 'ALL' || policy.cmd === PRIVILEGE[action] ||
    (action === 'update' && policy.cmd === 'SELECT');
}

function relevantTrigger(trigger, action) {
  const bits = { insert: 4, delete: 8, update: 16 };
  return action !== 'select' && Boolean(Number(trigger.tgtype) & bits[action]);
}

function grantResult(table, column, action) {
  const suffix = action;
  if (action === 'delete') {
    return { status: table.can_delete ? 'yes' : 'no', reason: 'DELETE is a table-level privilege, not a column privilege.' };
  }
  if (column) return {
    status: column[`can_${suffix}`] ? 'yes' : 'no',
    reason: `Evaluated ${PRIVILEGE[action]} for the requested column.`
  };
  if (table[`table_${suffix}`]) return {
    status: 'yes', reason: `Table-level ${PRIVILEGE[action]} privilege exists.`
  };
  if (table[`any_${suffix}`]) return {
    status: 'partial', reason: `Only some columns permit ${PRIVILEGE[action]}; specify a column to check.`
  };
  return { status: 'no', reason: `No ${PRIVILEGE[action]} privilege on the table or its columns.` };
}

export async function explainPermissions(db, input) {
  const { schema, table: tableName, column: columnName, action } = input;
  if (!PRIVILEGE[action]) throw new Error('Invalid operation.');
  if (action === 'delete' && columnName) {
    throw new Error('DELETE applies to entire rows, not individual columns. Omit column.');
  }
  if (input.filters?.length && action === 'insert') {
    throw new Error('INSERT checks new values, not an existing row. Omit filters.');
  }

  const { rows: tables } = await db.query(`
    SELECT c.oid, c.relkind, c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced, row_security_active(c.oid) AS rls_active,
      pg_get_userbyid(c.relowner) AS table_owner,
      has_schema_privilege(n.oid, 'USAGE') AS schema_usage,
      has_table_privilege(c.oid, 'SELECT') AS table_select,
      has_table_privilege(c.oid, 'INSERT') AS table_insert,
      has_table_privilege(c.oid, 'UPDATE') AS table_update,
      has_table_privilege(c.oid, 'DELETE') AS can_delete,
      has_any_column_privilege(c.oid, 'SELECT') AS any_select,
      has_any_column_privilege(c.oid, 'INSERT') AS any_insert,
      has_any_column_privilege(c.oid, 'UPDATE') AS any_update,
      current_user AS username,
      obj_description(c.oid, 'pg_class') AS description
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname=$1 AND c.relname=$2 AND c.relkind IN ('r','p','v','m','f')
    LIMIT 1`, [schema, tableName]);
  const table = tables[0];
  if (!table || !table.schema_usage) {
    // Do not reveal whether a relation exists in an inaccessible schema.
    throw new Error('Table does not exist or the schema is inaccessible.');
  }
  const hasAnyAccess = table.can_delete || table.any_select || table.any_insert || table.any_update;
  const { rows: cols } = await db.query(`
    SELECT a.attname AS name, a.attnum,
      has_column_privilege($1::oid, a.attnum, 'SELECT') AS can_select,
      has_column_privilege($1::oid, a.attnum, 'INSERT') AS can_insert,
      has_column_privilege($1::oid, a.attnum, 'UPDATE') AS can_update
    FROM pg_attribute a
    WHERE a.attrelid=$1::oid AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum`, [table.oid]);
  const requestedColumn = columnName ? cols.find(c => c.name === columnName) : undefined;
  // A user cannot use this explanatory tool to enumerate protected field names.
  if (columnName && (!requestedColumn ||
      !(requestedColumn.can_select || requestedColumn.can_insert || requestedColumn.can_update))) {
    return {
      user: table.username, target: { schema, table: tableName, column: columnName, action },
      grant: { status: 'no', reason: 'Column does not exist or is inaccessible to this user.' },
      row_security: { active: Boolean(table.rls_active) },
      verdict: 'blocked_or_not_found',
      limitations: ['Inaccessible columns and their rules are not disclosed.']
    };
  }

  // Without data privileges, do not disclose policy conditions, triggers or constraints.
  if (!hasAnyAccess) return {
    user: table.username, target: { schema, table: tableName, column: columnName ?? null, action },
    grant: { status: 'no', reason: 'No accessible operations for this table.' },
    verdict: 'blocked_by_privileges',
    row_security: { active: Boolean(table.rls_active) },
    limitations: ['Business rule details are unavailable because the table is inaccessible.']
  };

  const grant = grantResult(table, requestedColumn, action);
  const [policyResult, triggerResult, constraintResult] = await Promise.all([
    db.query(`SELECT p.policyname AS name, p.permissive, p.roles, p.cmd,
        p.qual AS using_expression, p.with_check AS check_expression,
        EXISTS (SELECT 1 FROM unnest(p.roles) AS role_filter(role_name)
          WHERE role_filter.role_name = 'public' OR EXISTS (
            SELECT 1 FROM pg_roles r
            WHERE r.rolname = role_filter.role_name
              AND pg_has_role(current_user, r.oid, 'USAGE')
          )) AS applies_to_current_user
      FROM pg_policies p WHERE p.schemaname=$1 AND p.tablename=$2
      ORDER BY p.policyname LIMIT 100`, [schema, tableName]),
    db.query(`SELECT t.tgname AS name, t.tgenabled AS enabled, t.tgtype,
        pg_get_triggerdef(t.oid) AS definition,
        obj_description(t.oid, 'pg_trigger') AS description
      FROM pg_trigger t WHERE t.tgrelid=$1::oid AND NOT t.tgisinternal
      ORDER BY t.tgname LIMIT 100`, [table.oid]),
    db.query(`SELECT conname AS name, contype AS type,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid=$1::oid
      ORDER BY conname LIMIT 100`, [table.oid])
  ]);
  const policies = policyResult.rows.filter(p => relevantPolicy(p, action) && p.applies_to_current_user);
  const triggers = triggerResult.rows.filter(t => relevantTrigger(t, action)).map(t => ({
    name: t.name, enabled: t.enabled, definition: t.definition, description: t.description,
    currently_fires: t.enabled === 'O' || t.enabled === 'A'
  }));
  const constraints = constraintResult.rows;

  let recordCheck = { status: 'not_requested' };
  if (input.filters?.length) {
    const readableColumns = cols.filter(c => c.can_select).map(c => ({ ...c }));
    if (!readableColumns.length) {
      recordCheck = { status: 'unavailable', reason: 'SELECT privileges are required to check an existing row.' };
    } else {
      // Build conditions only from columns readable by this user.
      const { where, params } = createWhere({ columns: readableColumns }, input.filters);
      try {
        const query = `SELECT 1 FROM ${quoteIdent(schema)}.${quoteIdent(tableName)}${where} LIMIT 1`;
        const visible = await db.query(query, params);
        recordCheck = {
          status: visible.rows.length ? 'visible_to_select' : 'not_visible_or_not_found',
          explanation: 'A SELECT check does not prove that UPDATE or DELETE is permitted.'
        };
      } catch (error) {
        // Do not reveal internal errors; probing a foreign table or a view
        // might be rejected for reasons unrelated to simple column GRANTs.
        if (error?.message?.startsWith('Column not accessible')) throw error;
        recordCheck = { status: 'unavailable', reason: 'The row visibility check could not be performed safely.' };
      }
    }
  }

  const viewWarning = table.relkind !== 'r' && table.relkind !== 'p';
  let verdict = grant.status === 'no' ? 'blocked_by_privileges' : 'conditional';
  if (action === 'select' && grant.status === 'yes' && recordCheck.status === 'visible_to_select') {
    verdict = 'row_visible_for_select';
  }
  if (action === 'select' && grant.status !== 'no' && recordCheck.status === 'not_visible_or_not_found') {
    verdict = 'not_visible_or_not_found';
  }
  return {
    user: table.username,
    target: { schema, table: tableName, column: columnName ?? null, action },
    grant,
    verdict,
    row_security: {
      configured: Boolean(table.rls_enabled), enforced_on_owner: Boolean(table.rls_forced),
      active_for_this_connection: Boolean(table.rls_active),
      applicable_policy_definitions: policies,
      interpretation: 'PERMISSIVE policies combine with OR; RESTRICTIVE policies with AND. WITH CHECK evaluates new row values. This is not a static guarantee for any specific write.'
    },
    record_check: recordCheck,
    business_rules: {
      triggers, constraints: ['insert', 'update'].includes(action) ? constraints : [],
      interpretation: 'Trigger functions and dependencies may enforce additional rules; this tool does not perform writes.'
    },
    limitations: [
      'This is an analysis of current privileges and database objects, not a formal proof of access.',
      'Only SELECT visibility may be checked on an existing row without mutations.',
      'PostgreSQL ultimately accepts or rejects a change when it is executed.',
      ...(viewWarning ? ['Views, foreign tables, and materialized views may use different underlying privileges and security contexts.'] : [])
    ]
  };
}
