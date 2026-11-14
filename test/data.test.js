import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteIdent, createWhere } from '../src/queryBuilder.js';

const table = { columns: [
  { name: 'status', can_select: true },
  { name: 'private', can_select: false },
  { name: 'a"b', can_select: true }
] };

test('quotes identifiers and prevents SQL injection', () => {
  assert.equal(quoteIdent('a"b'), '"a""b"');
  assert.throws(() => quoteIdent(''), /Invalid/);
  assert.equal(createWhere(table, [{column:'status', op:'eq', value:'x\'; DROP TABLE test; --'}]).where, ' WHERE "status" = $1');
});

test('cannot filter on invisible column', () => {
  assert.throws(() => createWhere(table, [{column:'private', op:'eq', value:1}]), /not accessible|not permitted|inaccessible/);
});

test('IN and NULL are handled without SQL interpolation', () => {
  const result = createWhere(table, [
    {column:'status', op:'in', value:['new','done']},
    {column:'a"b', op:'eq', value:null}
  ]);
  assert.equal(result.where, ' WHERE "status" IN ($1, $2) AND "a""b" IS NULL');
  assert.deepEqual(result.params, ['new','done']);
});
