import { createServer } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { config } from './config.js';
import { readBasicAuth, allowedOrigin } from './auth.js';
import { withDb, getIdentity } from './db.js';
import { buildMcpServer } from './mcp.js';
import { mayIssueRestToken, readRestSecret, signRestToken } from './restToken.js';

function respond(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(JSON.stringify(body));
}

// Best-effort local prototype limiter. For public deployment, use edge rate limits.
const authAttempts = new Map();
function rateLimit(req) {
  const now = Date.now();
  const ip = req.socket.remoteAddress || 'unknown';
  const window = authAttempts.get(ip) || { count: 0, start: now };
  if (now - window.start > 60_000) { window.count = 0; window.start = now; }
  window.count += 1;
  authAttempts.set(ip, window);
  if (authAttempts.size > 10000) {
    for (const [k, v] of authAttempts) if (now - v.start > 60_000) authAttempts.delete(k);
  }
  return window.count > 10;
}

async function issueToken(req, res) {
  if (!config.restEnabled) return respond(res, 404, { error: 'REST mode not configured' });
  if (!allowedOrigin(req.headers.host, undefined, config.allowedHosts)) {
    return respond(res, 403, { error: 'Host not permitted' });
  }
  const origin = req.headers.origin;
  if (origin && !config.authAllowedOrigins.includes(origin)) {
    return respond(res, 403, { error: 'Origin not permitted' });
  }
  const cors = origin ? {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '300'
  } : {};
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  if (req.method !== 'POST') return respond(res, 405, { error: 'Only POST supported' }, { ...cors, Allow: 'POST, OPTIONS' });
  if (rateLimit(req)) return respond(res, 429, { error: 'Too many login attempts' }, cors);
  const credentials = readBasicAuth(req.headers.authorization);
  if (!credentials) return respond(res, 401, { error: 'PostgreSQL login required' }, cors);
  try {
    const identity = await withDb(credentials, getIdentity);
    const allowed = await withDb(credentials, db => mayIssueRestToken(db, identity));
    if (!allowed) return respond(res, 403, { error: 'Account is not enabled for the REST API' }, cors);
    const secret = readRestSecret(config.restJwtSecretFile);
    const access_token = signRestToken(identity.username, secret);
    return respond(res, 200, { access_token, token_type: 'Bearer', expires_in: 900, rest_url: config.restPublicUrl }, cors);
  } catch {
    return respond(res, 401, { error: 'Invalid login or REST configuration' }, cors);
  }
}

const app = createServer(async (req, res) => {
  const path = (req.url || '').split('?')[0];
  if (req.method === 'GET' && path === '/health') {
    return respond(res, 200, { status: 'ok', service: 'axiomony' });
  }
  if (path === '/auth/token') return issueToken(req, res);
  if (path !== '/mcp') return respond(res, 404, { error: 'Not found' });
  if (!allowedOrigin(req.headers.host, req.headers.origin, config.allowedHosts)) {
    return respond(res, 403, { error: 'Host/Origin not permitted' });
  }
  if (req.method !== 'POST') {
    return respond(res, 405, { error: 'Only stateless POST MCP is supported in this MVP' },
      { Allow: 'POST' });
  }
  const length = Number(req.headers['content-length'] || 0);
  if (length > config.maxBodyBytes) return respond(res, 413, { error: 'Request too large' });
  if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) {
    return respond(res, 415, { error: 'Content-Type application/json required' });
  }
  const credentials = readBasicAuth(req.headers.authorization);
  if (!credentials) return respond(res, 401, { error: 'PostgreSQL credentials required' },
    { 'WWW-Authenticate': 'Basic realm="Axiomony", charset="UTF-8"' });

  let identity;
  try {
    // Login is checked by PostgreSQL itself; no user password is held in env,
    // no shared superuser and no application-side permission database.
    identity = await withDb(credentials, getIdentity);
  } catch {
    return respond(res, 401, { error: 'PostgreSQL login failed' },
      { 'WWW-Authenticate': 'Basic realm="Axiomony", charset="UTF-8"' });
  }

  // Read and bound request size before passing the parsed body to the MCP adapter.
  // This also protects against chunked uploads without Content-Length.
  let parsedBody;
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > config.maxBodyBytes) return respond(res, 413, { error: 'Request too large' });
      chunks.push(chunk);
    }
    parsedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return respond(res, 400, { error: 'Invalid JSON request' });
  }

  // Optional workspace session scope. With a stateless MCP client that cannot
  // send custom headers, pending plans are scoped to the DB user + random plan_id.
  // Clients that send this header also prevent a different session of the SAME
  // database user from approving their pending plans.
  const workspaceHeader = req.headers['x-mcp-workspace-session'];
  if (workspaceHeader !== undefined &&
      (typeof workspaceHeader !== 'string' ||
       !/^[A-Za-z0-9._-]{8,128}$/.test(workspaceHeader))) {
    return respond(res, 400, { error: 'Invalid X-MCP-Workspace-Session header' });
  }
  const workspaceSession = workspaceHeader || 'default';

  // New instance per HTTP request, bound to exactly one verified DB principal.
  const handler = createMcpHandler(
    () => buildMcpServer(credentials, identity, workspaceSession), { responseMode: 'json' }
  );
  const nodeHandler = toNodeHandler(handler);
  res.once('finish', () => void handler.close().catch(() => {}));
  res.once('close', () => void handler.close().catch(() => {}));
  try { await nodeHandler(req, res, parsedBody); }
  catch (error) {
    console.error('MCP transport error:', error?.message || 'unknown');
    if (!res.headersSent) respond(res, 500, { error: 'MCP transport error' });
    else res.end();
  }
});

app.listen(config.port, '0.0.0.0', () => {
  console.info(`Axiomony MCP serving /mcp on port ${config.port}; database=${config.database}; host=${config.host}`);
});
