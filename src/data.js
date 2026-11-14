import { visibleTable, listVisibleTables, publicTableDescription } from './db.js';
import { quoteIdent, createWhere, checkColumns } from './queryBuilder.js';

function nameOf(table) {
  return `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
}

export async function describe(db, schema, tableName) {
  return publicTableDescription(await visibleTable(db, schema, tableName));
}

export async function list(db) {
  return listVisibleTables(db);
}

export async function select(db, input) {
  const table = await visibleTable(db, input.schema, input.table);
  if (!table.can_select) throw new Error('You do not have SELECT permission on this table.');
  const columns = input.columns?.length
    ? input.columns : table.columns.filter(c => c.can_select).map(c => c.name);
  checkColumns(table, columns, 'select');
  if (!columns.length) throw new Error('No readable columns.');
  const { where, params } = createWhere(table, input.filters || []);
  let order = '';
  if (input.order_by) {
    checkColumns(table, [input.order_by], 'select');
    order = ` ORDER BY ${quoteIdent(input.order_by)} ${input.descending ? 'DESC' : 'ASC'}`;
  }
  const limit = Math.min(100, Math.max(1, input.limit || 50));
  params.push(limit);
  const sql = `SELECT ${columns.map(quoteIdent).join(', ')} FROM ${nameOf(table)}${where}${order} LIMIT $${params.length}`;
  const result = await db.query(sql, params);
  return { rows: result.rows, count: result.rows.length, limit };
}

export async function insert(db, input) {
  const table = await visibleTable(db, input.schema, input.table);
  if (!table.can_insert) throw new Error('You do not have INSERT permission on this table.');
  const record = input.record;
  if (!record || Array.isArray(record) || typeof record !== 'object') throw new Error('Record must be an object.');
  const names = Object.keys(record);
  if (!names.length || names.length > 100) throw new Error('Provide between 1 and 100 fields.');
  checkColumns(table, names, 'insert');
  const sql = `INSERT INTO ${nameOf(table)} (${names.map(quoteIdent).join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})`;
  const result = await db.query(sql, names.map(n => record[n]));
  return { inserted: result.rowCount };
}

async function writeWithLimit(db, sql, params, maxRows) {
  const maximum = Math.min(100, Math.max(1, maxRows ?? 20));
  await db.query('BEGIN');
  try {
    const result = await db.query(sql, params);
    if (result.rowCount > maximum) {
      throw new Error(`Meer dan ${maximum} records geraakt. Transactie teruggedraaid.`);
    }
    await db.query('COMMIT');
    return { affected: result.rowCount };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

export async function update(db, input) {
  const table = await visibleTable(db, input.schema, input.table);
  if (!table.can_update) throw new Error('You do not have UPDATE permission on this table.');
  if (!input.filters?.length) throw new Error('UPDATE requires at least one filter.');
  const values = input.values;
  if (!values || Array.isArray(values) || typeof values !== 'object') throw new Error('Values must be an object.');
  const names = Object.keys(values);
  if (!names.length || names.length > 100) throw new Error('Provide between 1 and 100 fields.');
  checkColumns(table, names, 'update');
  const params = names.map(n => values[n]);
  const { where } = createWhere(table, input.filters, params);
  const sets = names.map((name, i) => `${quoteIdent(name)}=$${i + 1}`).join(', ');
  return writeWithLimit(db, `UPDATE ${nameOf(table)} SET ${sets}${where}`, params, input.max_rows);
}

export async function remove(db, input) {
  const table = await visibleTable(db, input.schema, input.table);
  if (!table.can_delete) throw new Error('You do not have DELETE permission on this table.');
  if (!input.filters?.length) throw new Error('DELETE requires at least one filter.');
  const { where, params } = createWhere(table, input.filters);
  return writeWithLimit(db, `DELETE FROM ${nameOf(table)}${where}`, params, input.max_rows);
}
