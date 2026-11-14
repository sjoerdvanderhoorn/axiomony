// A deliberately conservative guardrail for version 0.1. This is NOT a SQL
// parser, sandbox, or proof of safety. Approval and PostgreSQL privileges
// remain mandatory. Never run LLM-generated migrations unattended.

export function splitStatements(sql) {
  if (typeof sql !== 'string' || !sql.trim() || sql.length > 40000) throw new Error('SQL leeg of te lang.');
  const out = [];
  let part = '', state = 'normal', dollar = '', depth = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i], next = sql[i + 1];
    if (state === 'normal') {
      if (ch === "'") state = 'single';
      else if (ch === '"') state = 'double';
      else if (ch === '-' && next === '-') { state = 'line'; part += ch + next; i++; continue; }
      else if (ch === '/' && next === '*') { state = 'block'; depth = 1; part += ch + next; i++; continue; }
      else if (ch === '$') {
        const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/);
        if (match) { state = 'dollar'; dollar = match[0]; part += dollar; i += dollar.length - 1; continue; }
      }
      else if (ch === ';') { if (part.trim()) out.push(part.trim()); part = ''; continue; }
    } else if (state === 'single') {
      if (ch === "'" && next === "'") { part += ch + next; i++; continue; }
      if (ch === "'") state = 'normal';
    } else if (state === 'double') {
      if (ch === '"' && next === '"') { part += ch + next; i++; continue; }
      if (ch === '"') state = 'normal';
    } else if (state === 'line') {
      if (ch === '\n') state = 'normal';
    } else if (state === 'block') {
      if (ch === '/' && next === '*') { depth++; part += ch + next; i++; continue; }
      if (ch === '*' && next === '/') { depth--; part += ch + next; i++; if (depth === 0) state = 'normal'; continue; }
    } else if (state === 'dollar') {
      if (sql.startsWith(dollar, i)) { part += dollar; i += dollar.length - 1; state = 'normal'; continue; }
    }
    part += ch;
  }
  if (!['normal', 'line'].includes(state)) throw new Error('Niet-afgesloten SQL-string of commentaar.');
  if (part.trim()) out.push(part.trim());
  if (!out.length || out.length > 40) throw new Error('SQL contains no usable statements or too many statements.');
  return out;
}

function stripLeadingComments(statement) {
  let s = statement;
  for (;;) {
    const old = s;
    s = s.trimStart();
    if (s.startsWith('--')) s = s.replace(/^--[^\n]*(?:\n|$)/, '');
    if (s.startsWith('/*')) s = s.replace(/^\/\*[\s\S]*?\*\//, '');
    if (s === old || (!s.startsWith('--') && !s.startsWith('/*'))) return s.trimStart();
  }
}

export function validateMigration(sql) {
  const statements = splitStatements(sql);
  const validPrefixes = /^(?:CREATE\s+(?:(?:OR\s+REPLACE\s+)?FUNCTION|TABLE|SCHEMA|(?:UNIQUE\s+)?INDEX|TRIGGER|POLICY|ROLE)|ALTER\s+(?:TABLE|POLICY)|DROP\s+(?:TRIGGER|POLICY|INDEX|FUNCTION)|COMMENT\s+ON|GRANT\b|REVOKE\b)/i;
  for (const st of statements) {
    const s = stripLeadingComments(st);
    if (!validPrefixes.test(s)) throw new Error(`SQL statement not allowed in this MVP: ${s.slice(0, 70)}`);
    // These restrictions apply to SQL outside function-body text by convention;
    // static inspection is not complete and a human must still review the plan.
    if (/^ALTER\s+TABLE\b/i.test(s) && /\b(DROP\s+COLUMN|DROP\s+CONSTRAINT|DISABLE\s+ROW\s+LEVEL\s+SECURITY)\b/i.test(s)) {
      throw new Error('Destructieve ALTER TABLE geblokkeerd in de MVP.');
    }
    if (/^CREATE\s+ROLE\b/i.test(s) && /\b(LOGIN|PASSWORD|SUPERUSER|REPLICATION)\b/i.test(s)) {
      throw new Error('Creating login accounts and passwords is outside this MVP scope.');
    }
    if (/\bSECURITY\s+DEFINER\b/i.test(s)) throw new Error('SECURITY DEFINER is geblokkeerd.');
    if (/\bSET\s+ROLE\b/i.test(s)) throw new Error('SET ROLE is geblokkeerd.');
  }
  return statements;
}
