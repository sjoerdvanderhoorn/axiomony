import test from 'node:test';
import assert from 'node:assert/strict';
import { splitStatements, validateMigration } from '../src/sqlSafety.js';

test('splitStatements respects PL/pgSQL dollar blocks', () => {
  const sql = `CREATE FUNCTION test() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW.status = 'done; okay' THEN RAISE EXCEPTION 'fail'; END IF;
    RETURN NEW;
  END; $$; CREATE TRIGGER t BEFORE UPDATE ON x FOR EACH ROW EXECUTE FUNCTION test();`;
  assert.equal(splitStatements(sql).length, 2);
  assert.equal(validateMigration(sql).length, 2);
});

test('block obvious unsafe SQL', () => {
  for (const sql of [
    'DELETE FROM invoices;', 'DROP TABLE invoices;',
    "DO $$ BEGIN RAISE NOTICE 'Hi'; END $$;",
    'ALTER SYSTEM SET log_min_duration_statement=0;',
    'CREATE ROLE evil LOGIN PASSWORD \'x\';',
    'ALTER TABLE invoices DROP COLUMN amount;',
    'CREATE FUNCTION f() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1; $$;'
  ]) assert.throws(() => validateMigration(sql));
});

test('accept safe-looking DDL', () => {
  assert.equal(validateMigration('CREATE TABLE public.test (id integer); GRANT SELECT ON public.test TO analyst;').length, 2);
});
