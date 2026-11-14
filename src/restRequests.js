import { checkColumns } from './queryBuilder.js';

const validApiName = /^[a-z_][a-z0-9_]*$/;
const supported = new Set(['select', 'insert', 'update', 'delete']);
const comparisonOps = new Set(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike']);

function apiName(name) {
  if (!validApiName.test(name)) {
    throw new Error(`The PostgREST query generator currently supports only lowercase snake_case names: ${name}`);
  }
  return name;
}

function literal(value) {
  if (typeof value === 'string') {
    if (value.includes('\0') || value.length > 2048) throw new Error('Invalid or excessively long filter value.');
    // PostgREST grammar reserves commas, dots, parentheses and quotes.
    return /[,()."\\]/.test(value) ? `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"` : value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  throw new Error('Filters support only strings, numbers, booleans, and null.');
}

function buildFilters(table, filters, url) {
  if (!Array.isArray(filters) || filters.length > 20) throw new Error('At most 20 filters are allowed.');
  for (const f of filters) {
    if (!f || typeof f.column !== 'string') throw new Error('Invalid filter.');
    const col = apiName(f.column);
    checkColumns(table, [col], 'select');
    const op = f.op || 'eq';
    let expression;
    if (op === 'is_null' || op === 'not_null' || (f.value === null && ['eq', 'ne'].includes(op))) {
      expression = op === 'not_null' || op === 'ne' ? 'not.is.null' : 'is.null';
    } else if (op === 'in') {
      if (!Array.isArray(f.value) || !f.value.length || f.value.length > 20) {
        throw new Error('IN requires between 1 and 20 values.');
      }
      expression = `in.(${f.value.map(literal).join(',')})`;
    } else if (comparisonOps.has(op)) {
      expression = `${op}.${literal(f.value)}`;
    } else {
      throw new Error(`Unknown filter operator: ${op}`);
    }
    // URLSearchParams handles HTTP escaping after PostgREST's own quoting rules.
    url.searchParams.append(col, expression);
  }
}

function sampleCode(url, method, headers, body) {
  const displayedHeaders = Object.fromEntries(Object.entries(headers).map(([k, v]) =>
    [k, k.toLowerCase() === 'authorization' ? 'Bearer ${token}' : v]));
  const headerLines = Object.entries(displayedHeaders).map(([k, v]) =>
    `    ${JSON.stringify(k)}: ${k.toLowerCase() === 'authorization' ? '`Bearer ${token}`' : JSON.stringify(v)}`);
  return [
    '// First obtain a short-lived token from POST /auth/token.',
    '// Do not embed the authentication token in generated source code.',
    `const url = ${JSON.stringify(url)};`,
    'const result = await fetch(url, {',
    `  method: ${JSON.stringify(method)},`,
    '  headers: {',
    headerLines.join(',\n'),
    '  },',
    ...(body === undefined ? [] : [`  body: JSON.stringify(${JSON.stringify(body, null, 2)}),`]),
    '});',
    'if (!result.ok) throw new Error(`REST error ${result.status}`);',
    "const data = result.status === 204 ? null : await result.json();"
  ].filter(Boolean).join('\n');
}

export function buildRestRequest(table, input, settings) {
  const operation = input.operation;
  if (!supported.has(operation)) throw new Error('Ondersteunde acties: select, insert, update, delete.');
  if (!settings.enabled) throw new Error('REST API is not configured; start the REST service.');
  if (!settings.schemas.includes(table.schema)) {
    throw new Error(`Schema ${table.schema} is not exposed by PostgREST.`);
  }
  apiName(table.name);
  const allowed = { select: 'can_select', insert: 'can_insert', update: 'can_update', delete: 'can_delete' };
  if (!table[allowed[operation]]) throw new Error(`No ${operation.toUpperCase()} permission on this table.`);

  const base = settings.publicUrl.replace(/\/+$/, '');
  const url = new URL(`${base}/${table.name}`);
  const method = { select: 'GET', insert: 'POST', update: 'PATCH', delete: 'DELETE' }[operation];
  const headers = { Authorization: 'Bearer <ACCESS_TOKEN>', Accept: 'application/json' };
  if (operation === 'select') {
    const cols = input.columns?.length ? input.columns : table.columns.filter(c => c.can_select).map(c => c.name);
    if (!cols.length || cols.length > 100) throw new Error('Selecteer 1 tot 100 leesbare kolommen.');
    checkColumns(table, cols, 'select');
    url.searchParams.set('select', cols.map(apiName).join(','));
    if (input.order_by) {
      checkColumns(table, [apiName(input.order_by)], 'select');
      url.searchParams.set('order', `${input.order_by}.${input.descending ? 'desc' : 'asc'}`);
    }
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be between 1 and 100.');
    url.searchParams.set('limit', String(limit));
  }

  if (operation === 'update' || operation === 'delete') {
    if (!input.filters?.length) throw new Error('UPDATE and DELETE require at least one filter.');
  }
  if (operation !== 'insert') buildFilters(table, input.filters || [], url);

  let body;
  if (operation === 'insert' || operation === 'update') {
    body = input.record;
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length === 0) {
      throw new Error('record must be a non-empty object.');
    }
    const names = Object.keys(body);
    if (names.length > 100) throw new Error('At most 100 input fields are allowed.');
    names.forEach(apiName);
    checkColumns(table, names, operation);
    headers['Content-Type'] = 'application/json';
    headers.Prefer = 'return=minimal';
  }
  if (operation === 'delete') headers.Prefer = 'return=minimal';
  if (settings.schemas.length > 1) {
    headers[operation === 'select' ? 'Accept-Profile' : 'Content-Profile'] = table.schema;
  }
  const result = {
    description: `${operation.toUpperCase()} on ${table.schema}.${table.name}, directly via PostgREST`,
    method, url: url.toString(), headers,
    auth: { token_endpoint: settings.tokenUrl, token_type: 'Bearer', expires_in_seconds: 900 },
    ... (body === undefined ? {} : { body }),
    javascript: sampleCode(url.toString(), method, headers, body),
    note: 'This is a template. PostgreSQL rechecks effective privileges, RLS, and triggers when the request executes.'
  };
  if (['update', 'delete'].includes(operation)) {
    result.warning = 'The URL includes filters, but PostgREST does not enforce a maximum number of affected rows. Do not remove the filters; protect against bulk modifications in PostgreSQL.';
  }
  return result;
}
