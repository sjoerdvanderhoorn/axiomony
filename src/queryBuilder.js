export function quoteIdent(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.length > 63) {
    throw new Error('Invalid SQL identifier.');
  }
  return `"${value.replaceAll('"', '""')}"`;
}

export function checkColumns(table, fields, capability) {
  const unique = [...new Set(fields)];
  for (const name of unique) {
    const column = table.columns.find(col => col.name === name);
    if (!column || !column[`can_${capability}`]) {
      throw new Error(`Column is not accessible for ${capability}: ${name}`);
    }
  }
  return unique;
}

export function createWhere(table, filters, params = []) {
  if (!Array.isArray(filters) || filters.length > 20) throw new Error('Maximaal 20 filters.');
  const pieces = [];
  for (const f of filters) {
    if (!f || typeof f.column !== 'string') throw new Error('Invalid filter.');
    checkColumns(table, [f.column], 'select');
    const col = quoteIdent(f.column);
    const op = f.op || 'eq';
    if (op === 'is_null' || op === 'not_null') {
      pieces.push(`${col} IS ${op === 'not_null' ? 'NOT ' : ''}NULL`);
    } else if (op === 'in') {
      if (!Array.isArray(f.value) || !f.value.length || f.value.length > 20) {
        throw new Error('IN filter must contain between 1 and 20 values.');
      }
      const placeholders = [];
      for (const value of f.value) {
        params.push(value);
        placeholders.push(`$${params.length}`);
      }
      pieces.push(`${col} IN (${placeholders.join(', ')})`);
    } else {
      const operators = {
        eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
        like: 'LIKE', ilike: 'ILIKE'
      };
      if (!operators[op]) throw new Error(`Unknown filter operator: ${op}`);
      if (f.value === null && (op === 'eq' || op === 'ne')) {
        pieces.push(`${col} IS ${op === 'ne' ? 'NOT ' : ''}NULL`);
      } else {
        params.push(f.value);
        pieces.push(`${col} ${operators[op]} $${params.length}`);
      }
    }
  }
  return { where: pieces.length ? ` WHERE ${pieces.join(' AND ')}` : '', params };
}

