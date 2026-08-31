const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const client = new Client({ connectionString: 'postgresql://crm:crm@localhost:5432/crm_salvadora' });
  await client.connect();

  const validAdminHash = '$2b$10$HlLh2uJiSz80wVFdYkPBVu2IAW5JJlz8/GfS9Hk9eTqSapk0eS8W.'; // Admin1234!

  let sql = `-- =============================================================================\n`;
  sql += `-- CRM SALVADORA - COPIA COMPLETA DE TODA LA BASE DE DATOS LOCAL CON PRIMARY KEYS\n`;
  sql += `-- =============================================================================\n\n`;
  sql += `DROP SCHEMA IF EXISTS public CASCADE;\n`;
  sql += `CREATE SCHEMA public;\n`;
  sql += `GRANT ALL ON SCHEMA public TO postgres;\n`;
  sql += `GRANT ALL ON SCHEMA public TO public;\n\n`;
  sql += `CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;\n\n`;

  // 1. Get all ENUM types
  const typesRes = await client.query(`
    SELECT t.typname, string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) as enum_values
    FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid  
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname;
  `);

  for (const t of typesRes.rows) {
    sql += `CREATE TYPE "${t.typname}" AS ENUM (${t.enum_values});\n`;
  }
  sql += `\n`;

  // 2. Get all tables
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  const tables = tablesRes.rows.map(r => r.table_name);

  // 3. For each table, generate CREATE TABLE with constraints
  const tableColumns = {};
  for (const table of tables) {
    const colsRes = await client.query(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `, [table]);

    tableColumns[table] = colsRes.rows;

    // Get Primary Key / Unique constraints for this table
    const constraintsRes = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname = 'public' AND cl.relname = $1 AND c.contype IN ('p', 'u')
      ORDER BY c.contype;
    `, [table]);

    sql += `CREATE TABLE "${table}" (\n`;
    const colDefs = colsRes.rows.map(c => {
      let typeStr = c.data_type.toUpperCase();
      if (c.data_type === 'USER-DEFINED') {
        typeStr = `"${c.udt_name}"`;
      } else if (c.data_type === 'ARRAY') {
        typeStr = 'TEXT[]';
      } else if (c.data_type === 'character varying') {
        typeStr = 'VARCHAR';
      } else if (c.data_type === 'timestamp with time zone') {
        typeStr = 'TIMESTAMP WITH TIME ZONE';
      } else if (c.data_type === 'timestamp without time zone') {
        typeStr = 'TIMESTAMP WITHOUT TIME ZONE';
      }

      let def = `    "${c.column_name}" ${typeStr}`;
      if (c.column_default && !c.column_default.startsWith('nextval')) {
        def += ` DEFAULT ${c.column_default}`;
      }
      if (c.is_nullable === 'NO') {
        def += ` NOT NULL`;
      }
      return def;
    });

    for (const con of constraintsRes.rows) {
      colDefs.push(`    CONSTRAINT "${con.conname}" ${con.def}`);
    }

    sql += colDefs.join(',\n');
    sql += `\n);\n\n`;
  }

  // 4. Insert data for all tables with exact Postgres types
  for (const t of tables) {
    const rowsRes = await client.query(`SELECT * FROM "${t}"`);
    if (rowsRes.rows.length > 0) {
      sql += `-- ==========================================\n`;
      sql += `-- Datos: ${t} (${rowsRes.rows.length} registros)\n`;
      sql += `-- ==========================================\n`;

      const cols = tableColumns[t];
      const colTypeMap = {};
      for (const c of cols) {
        colTypeMap[c.column_name] = { dataType: c.data_type, udtName: c.udt_name };
      }

      for (const row of rowsRes.rows) {
        if (t === 'users') {
          row.passwordHash = validAdminHash;
        }
        if (t === 'agent_configs') {
          row.openrouterApiKey = 'sk-or-placeholder';
          row.ycloudApiKey = 'ycloud-placeholder';
        }
        if (t === 'payment_account' || t === 'payment_accounts') {
          row.stripeSecretKey = 'sk-placeholder';
        }
        if (t === 'vapi_accounts') {
          row.apiKey = 'vapi-placeholder';
        }
        if (t === 'email_account' || t === 'email_accounts') {
          row.smtpPass = 'smtp-placeholder';
        }

        const keys = Object.keys(row).map(k => `"${k}"`).join(', ');
        const values = Object.entries(row).map(([k, v]) => {
          if (v === null || v === undefined) return 'NULL';
          const colInfo = colTypeMap[k] || {};

          // Handle json and jsonb
          if (colInfo.dataType === 'json' || colInfo.dataType === 'jsonb' || colInfo.udtName === 'json' || colInfo.udtName === 'jsonb') {
            const jsonStr = (typeof v === 'object') ? JSON.stringify(v) : String(v);
            return `'${jsonStr.replace(/'/g, "''")}'::jsonb`;
          }

          // Handle Postgres Array types (e.g. TEXT[])
          if (colInfo.dataType === 'ARRAY' || colInfo.udtName?.startsWith('_')) {
            let arr = v;
            if (typeof arr === 'string') {
              try { arr = JSON.parse(arr); } catch {}
            }
            if (Array.isArray(arr)) {
              if (arr.length === 0) return "'{}'::text[]";
              const escapedElements = arr.map(e => `"${String(e).replace(/"/g, '\\"')}"`).join(',');
              return `'{${escapedElements}}'::text[]`;
            }
          }

          if (typeof v === 'boolean') return v ? 'true' : 'false';
          if (typeof v === 'number') return v;
          if (v instanceof Date) return `'${v.toISOString()}'`;
          if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
          return `'${String(v).replace(/'/g, "''")}'`;
        }).join(', ');

        sql += `INSERT INTO "${t}" (${keys}) VALUES (${values});\n`;
      }
      sql += `\n`;
    }
  }

  const outPath = path.join(__dirname, '..', '..', '..', 'docs', 'dump_local_completo.sql');
  fs.writeFileSync(outPath, sql, 'utf8');
  console.log('Saved 100% COMPLETE DDL + DATA dump WITH PKs to:', outPath);
  console.log(`Total size: ${(sql.length / 1024).toFixed(2)} KB, Tables: ${tables.length}`);
  await client.end();
}

main();
