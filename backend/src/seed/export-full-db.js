const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionStrings = [
  'postgresql://crm:crm@localhost:5433/crm_salvadora',
  'postgresql://postgres:postgres@localhost:5432/crm_salvadora',
  'postgresql://postgres:W39xlpS9@localhost:5433/crm_salvadora',
  'postgresql://crm:crm@localhost:5432/crm_salvadora',
];

async function tryConnect() {
  for (const cs of connectionStrings) {
    const client = new Client({ connectionString: cs });
    try {
      await client.connect();
      console.log('Successfully connected using:', cs);
      return client;
    } catch (e) {
      // try next
    }
  }
  return null;
}

async function exportFullDb() {
  const client = await tryConnect();
  if (!client) {
    console.error('Could not connect to any local PostgreSQL instance.');
    process.exit(1);
  }

  try {
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const tables = tablesRes.rows.map(r => r.table_name);
    console.log('Found tables:', tables);

    let sqlOutput = `-- =============================================================================\n`;
    sqlOutput += `-- COPIA COMPLETA DE BASE DE DATOS LOCAL CRM SALVADORA\n`;
    sqlOutput += `-- =============================================================================\n\n`;
    sqlOutput += `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n`;

    for (const table of tables) {
      const rowsRes = await client.query(`SELECT * FROM "${table}"`);
      console.log(`Table ${table}: ${rowsRes.rows.length} rows`);

      if (rowsRes.rows.length > 0) {
        sqlOutput += `-- Datos para la tabla: ${table}\n`;
        for (const row of rowsRes.rows) {
          const keys = Object.keys(row).map(k => `"${k}"`).join(', ');
          const values = Object.values(row).map(v => {
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'boolean') return v ? 'true' : 'false';
            if (typeof v === 'number') return v;
            if (v instanceof Date) return `'${v.toISOString()}'`;
            if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
            return `'${String(v).replace(/'/g, "''")}'`;
          }).join(', ');

          sqlOutput += `INSERT INTO "${table}" (${keys}) VALUES (${values}) ON CONFLICT DO NOTHING;\n`;
        }
        sqlOutput += `\n`;
      }
    }

    const targetPath = path.join(__dirname, '..', '..', '..', 'docs', 'dump_local_completo.sql');
    fs.writeFileSync(targetPath, sqlOutput, 'utf8');
    console.log(`Dump written to ${targetPath} (${sqlOutput.length} chars)`);
  } catch (err) {
    console.error('Error during dump:', err);
  } finally {
    await client.end();
  }
}

exportFullDb();
