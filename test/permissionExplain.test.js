import test from 'node:test';
import assert from 'node:assert/strict';
import { explainPermissions } from '../src/permissionExplain.js';

function dbStub({ columnAccess = true, tableAccess = true, visible = true, owner = false } = {}) {
  const history = [];
  const table = {
    oid: 100, relkind: 'r', rls_enabled: true, rls_forced: false,
    rls_active: !owner, schema_usage: true, table_owner: 'manager',
    username: 'medewerker', description: null,
    table_select: false, any_select: tableAccess,
    table_insert: false, any_insert: false,
    table_update: false, any_update: false,
    can_delete: false
  };
  const col = { name: 'status', attnum: 1, can_select: columnAccess, can_insert: false, can_update: false };
  const fake = {
    history,
    async query(sql, params = []) {
      history.push({ sql, params });
      if (sql.includes('FROM pg_class c JOIN pg_namespace')) return { rows: [table] };
      if (sql.includes('FROM pg_attribute a')) return { rows: [col] };
      if (sql.includes('FROM pg_policies')) return { rows: [{ name: 'read_own', permissive: 'PERMISSIVE',
        roles: ['public'], applies_to_current_user: true, cmd: 'SELECT', using_expression: 'owner = current_user', check_expression: null }] };
      if (sql.includes('FROM pg_trigger')) return { rows: [{ name: 'check_status',
        enabled: 'O', tgtype: 19, definition: 'CREATE TRIGGER...', description: 'check status' }] };
      if (sql.includes('FROM pg_constraint')) return { rows: [{ name: 'check_amount', type: 'c', definition: 'CHECK (amount > 0)' }] };
      if (sql.startsWith('SELECT 1 FROM')) return { rows: visible ? [{ '?column?': 1 }] : [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  return fake;
}

test('SELECT row explanation uses only a parameterized read-only probe', async () => {
  const db = dbStub();
  const result = await explainPermissions(db, { schema: 'public', table: 'invoices', column: 'status',
    action: 'select', filters: [{ column: 'status', op: 'eq', value: 'pending' }] });
  assert.equal(result.verdict, 'row_visible_for_select');
  assert.equal(result.row_security.applicable_policy_definitions.length, 1);
  assert.deepEqual(db.history.at(-1).params, ['pending']);
  assert.match(db.history.at(-1).sql, /SELECT 1 FROM "public"\."invoices" WHERE "status" = \$1 LIMIT 1/);
  assert.ok(db.history.every(({ sql }) => !/\b(UPDATE|DELETE|INSERT|ALTER)\b/i.test(sql.replace(/'UPDATE'|'DELETE'|'INSERT'/g, ''))));
});

test('RLS-hidden row is not reported as a known nonexistent record', async () => {
  const result = await explainPermissions(dbStub({ visible: false }), { schema: 'public', table: 'invoices',
    action: 'select', filters: [{ column: 'status', op: 'eq', value: 'pending' }] });
  assert.equal(result.verdict, 'not_visible_or_not_found');
});

test('Column-level grant denial does not leak policy or trigger definitions', async () => {
  const result = await explainPermissions(dbStub({ columnAccess: false }), {
    schema: 'public', table: 'invoices', action: 'select', column: 'status', filters: [] });
  assert.equal(result.grant.status, 'no');
  assert.equal(result.business_rules, undefined);
});

test('INSERT does not accept row probe filters', async () => {
  await assert.rejects(() => explainPermissions(dbStub(), {
    schema: 'public', table: 'invoices', action: 'insert', filters: [{ column: 'status', value: 'x' }] }),
  /Omit filters/);
});

test('UPDATE shows trigger and constraint, but does not claim write is allowed', async () => {
  const db = dbStub();
  const result = await explainPermissions(db, { schema: 'public', table: 'invoices', action: 'update', filters: [] });
  assert.equal(result.verdict, 'blocked_by_privileges');
  assert.equal(result.business_rules.triggers.length, 1);
  assert.equal(result.business_rules.constraints.length, 1);
  assert.equal(db.history.some(({ sql }) => sql.startsWith('SELECT 1 FROM')), false);
});

test('Reject row probes on a column without SELECT permission', async () => {
  const db = dbStub();
  await assert.rejects(() => explainPermissions(db, { schema: 'public', table: 'invoices',
    action: 'delete', filters: [{ column: 'secret', op: 'eq', value: 'x' }] }),
  /not accessible|not permitted|inaccessible/);
});
