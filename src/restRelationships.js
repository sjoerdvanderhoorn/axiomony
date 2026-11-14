// Describe only relationships between tables a user can SELECT, based entirely
// on pg_constraint; there is no shadow schema or relationship registry.
export async function listRestRelationships(db, exposedSchemas, table = null) {
  const { rows } = await db.query(`
    SELECT c.conname AS foreign_key,
      ns.nspname AS source_schema, src.relname AS source_table,
      nt.nspname AS target_schema, dst.relname AS target_table,
      array_agg(sa.attname ORDER BY f.ord) AS source_columns,
      array_agg(da.attname ORDER BY f.ord) AS target_columns
    FROM pg_constraint c
      JOIN pg_class src ON src.oid = c.conrelid
      JOIN pg_class dst ON dst.oid = c.confrelid
      JOIN pg_namespace ns ON ns.oid = src.relnamespace
      JOIN pg_namespace nt ON nt.oid = dst.relnamespace
      JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS f(src_att, dst_att, ord) ON true
      JOIN pg_attribute sa ON sa.attrelid = src.oid AND sa.attnum = f.src_att
      JOIN pg_attribute da ON da.attrelid = dst.oid AND da.attnum = f.dst_att
    WHERE c.contype = 'f'
      AND ns.nspname = ANY($1::text[]) AND nt.nspname = ANY($1::text[])
      AND has_schema_privilege(ns.oid, 'USAGE') AND has_schema_privilege(nt.oid, 'USAGE')
      AND has_any_column_privilege(src.oid, 'SELECT') AND has_any_column_privilege(dst.oid, 'SELECT')
      AND has_column_privilege(src.oid, sa.attnum, 'SELECT')
      AND has_column_privilege(dst.oid, da.attnum, 'SELECT')
      AND ($2::text IS NULL OR (ns.nspname || '.' || src.relname) = $2
        OR (nt.nspname || '.' || dst.relname) = $2)
    GROUP BY c.oid, c.conname, ns.nspname, src.relname, nt.nspname, dst.relname
    ORDER BY source_schema, source_table, foreign_key
    LIMIT 250
  `, [exposedSchemas, table]);
  return { relationships: rows, note: 'For PostgREST use select=field,related_table(field); with multiple foreign keys, !foreign_key disambiguation may be required.' };
}
