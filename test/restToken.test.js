import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { signRestToken, mayIssueRestToken } from '../src/restToken.js';

test('JWT has signed, short-lived PostgreSQL role and fixed REST audience', () => {
  const secret = 'a'.repeat(64);
  const token = signRestToken('medewerker', secret, 1730000000);
  const [header, claims, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'HS256', typ: 'JWT' });
  const payload = JSON.parse(Buffer.from(claims, 'base64url').toString());
  assert.equal(payload.role, 'medewerker');
  assert.equal(payload.aud, 'pg-app-rest');
  assert.equal(payload.exp - payload.iat, 900);
  assert.equal(signature, createHmac('sha256', secret).update(`${header}.${claims}`).digest('base64url'));
});

test('deny REST for administrator, even if role mapped', async () => {
  const mock = { query: () => { throw new Error('should not query'); } };
  assert.equal(await mayIssueRestToken(mock, { username: 'admin', is_admin: true }), false);
});

test('deny REST if not explicitly granted or elevated', async () => {
  const db = { query: async () => ({ rows: [{ mapped: false, elevated: false }] }) };
  assert.equal(await mayIssueRestToken(db, { username: 'employee', is_admin: false }), false);
  db.query = async () => ({ rows: [{ mapped: true, elevated: true }] });
  assert.equal(await mayIssueRestToken(db, { username: 'employee', is_admin: false }), false);
  db.query = async () => ({ rows: [{ mapped: true, elevated: false }] });
  assert.equal(await mayIssueRestToken(db, { username: 'employee', is_admin: false }), true);
});
