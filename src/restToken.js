import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config } from './config.js';

export function signRestToken(username, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Onvoldoende sterk JWT-geheim.');
  if (typeof username !== 'string' || username.length < 1) throw new Error('Invalid user.');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    role: username, sub: username, iss: 'axiomony', aud: 'pg-app-rest',
    iat: nowSeconds, exp: nowSeconds + 900, jti: randomUUID()
  })).toString('base64url');
  const data = `${header}.${claims}`;
  const signature = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function readRestSecret(path) {
  if (!path) throw new Error('REST authentication is disabled.');
  const secret = readFileSync(path, 'utf8').trim();
  if (secret.length < 32) throw new Error('REST JWT-geheim te kort.');
  return secret;
}

// Only the explicitly configured PostgREST authenticator can impersonate a user.
// Users with elevated DB capabilities are intentionally disallowed in browser apps.
export async function mayIssueRestToken(db, identity) {
  if (identity.is_admin || identity.username === 'postgrest_authenticator') return false;
  const { rows } = await db.query(`
    SELECT COALESCE(pg_has_role('postgrest_authenticator'::regrole, current_user, 'SET'), false) AS mapped,
      (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
       OR EXISTS (
         SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relowner = r.oid AND c.relkind IN ('r','p','v','m')
           AND n.nspname = ANY($1::text[])
       )) AS elevated
    FROM pg_roles r WHERE r.rolname = current_user
  `, [config.restSchemas]);
  return rows[0]?.mapped === true && rows[0]?.elevated === false;
}
