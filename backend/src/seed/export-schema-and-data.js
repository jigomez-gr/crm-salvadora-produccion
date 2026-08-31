const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const client = new Client({ connectionString: 'postgresql://crm:crm@localhost:5432/crm_salvadora' });
  await client.connect();

  const validAdminHash = '$2b$10$HlLh2uJiSz80wVFdYkPBVu2IAW5JJlz8/GfS9Hk9eTqSapk0eS8W.'; // Admin1234!

  let sql = `-- =============================================================================\n`;
  sql += `-- CRM SALVADORA - COPIA EXACTA COMPLETA DE BASE DE DATOS LOCAL\n`;
  sql += `-- =============================================================================\n\n`;
  sql += `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n`;

  // Get all tables
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  const tables = tablesRes.rows.map(r => r.table_name);

  // For each table, dump its data
  for (const t of tables) {
    const rowsRes = await client.query(`SELECT * FROM "${t}"`);
    if (rowsRes.rows.length > 0) {
      sql += `-- Datos: ${t}\n`;
      for (const row of rowsRes.rows) {
        if (t === 'users') {
          row.passwordHash = validAdminHash;
        }
        if (t === 'vapi_accounts' || t === 'payment_account') {
          // Mask or keep valid format
        }
        const keys = Object.keys(row).map(k => `"${k}"`).join(', ');
        const values = Object.values(row).map(v => {
          if (v === null || v === undefined) return 'NULL';
          if (typeof v === 'boolean') return v ? 'true' : 'false';
          if (typeof v === 'number') return v;
          if (v instanceof Date) return `'${v.toISOString()}'`;
          if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
          return `'${String(v).replace(/'/g, "''")}'`;
        }).join(', ');

        sql += `INSERT INTO "${t}" (${keys}) VALUES (${values}) ON CONFLICT DO NOTHING;\n`;
      }
      sql += `\n`;
    }
  }

  const outPath = path.join(__dirname, '..', '..', '..', 'docs', 'dump_local_completo.sql');
  fs.writeFileSync(outPath, sql, 'utf8');
  console.log('Saved dump to:', outPath);
  await client.end();
}

main();
