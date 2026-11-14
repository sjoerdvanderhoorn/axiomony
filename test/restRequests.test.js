import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRestRequest } from '../src/restRequests.js';

const table = {
  schema: 'public', name: 'invoices', can_select: true, can_insert: true,
  can_update: true, can_delete: false,
  columns: [
    { name: 'id', can_select: true, can_insert: false, can_update: false },
    { name: 'status', can_select: true, can_insert: true, can_update: true },
    { name: 'amount', can_select: false, can_insert: true, can_update: false },
    { name: 'internal', can_select: false, can_insert: false, can_update: false }
  ]
};
const settings = {
  enabled: true, publicUrl: 'http://localhost:3001', tokenUrl: 'http://localhost:3000/auth/token', schemas: ['public']
};

test('generates a direct SELECT REST request with column and filter validation', () => {
  const result = buildRestRequest(table, {
    operation: 'select', columns: ['id', 'status'], filters: [{ column: 'status', op: 'eq', value: 'approved with spaces' }],
    limit: 20, order_by: 'id', descending: true
  }, settings);
  const url = new URL(result.url);
  assert.equal(result.method, 'GET');
  assert.equal(url.pathname, '/invoices');
  assert.equal(url.searchParams.get('select'), 'id,status');
  assert.equal(url.searchParams.get('status'), 'eq.approved with spaces');
  assert.equal(url.searchParams.get('order'), 'id.desc');
  assert.equal(url.searchParams.get('limit'), '20');
  assert.match(result.javascript, /fetch\(url/);
});

test('rejects a column that user cannot read', () => {
  assert.throws(() => buildRestRequest(table, {
    operation: 'select', columns: ['amount'], filters: []
  }, settings), /Column is not accessible/);
});

test('generates a direct PATCH REST request with required filter and body', () => {
  const result = buildRestRequest(table, {
    operation: 'update', record: { status: 'approved' },
    filters: [{ column: 'id', op: 'eq', value: 8 }]
  }, settings);
  assert.equal(result.method, 'PATCH');
  assert.deepEqual(result.body, { status: 'approved' });
  assert.equal(new URL(result.url).searchParams.get('id'), 'eq.8');
  assert.equal(result.headers.Prefer, 'return=minimal');
  assert.match(result.warning, /filters/);
});

test('requires PATCH filters and denies DELETE', () => {
  assert.throws(() => buildRestRequest(table, {
    operation: 'update', record: { status: 'x' }, filters: []
  }, settings), /require at least one filter/);
  assert.throws(() => buildRestRequest(table, {
    operation: 'delete', filters: [{ column: 'id', value: 1 }]
  }, settings), /No DELETE permission/);
});

test('escapes syntax-sensitive filter strings safely for URL params', () => {
  const result = buildRestRequest(table, {
    operation: 'select', columns: ['status'],
    filters: [{ column: 'status', op: 'in', value: ['a,b', 'x"y'] }]
  }, settings);
  assert.equal(new URL(result.url).searchParams.get('status'), 'in.("a,b","x\\"y")');
});

test('generates Content-Profile for non-default API schema', () => {
  const result = buildRestRequest({ ...table, schema: 'finance' }, {
    operation: 'insert', record: { amount: 500, status: 'new' }
  }, { ...settings, schemas: ['public', 'finance'] });
  assert.equal(result.headers['Content-Profile'], 'finance');
});

test('never exposes a non-published relation in the query builder', () => {
  assert.throws(() => buildRestRequest({ ...table, schema: 'private' }, {
    operation: 'select', filters: []
  }, settings), /not exposed/);
});
