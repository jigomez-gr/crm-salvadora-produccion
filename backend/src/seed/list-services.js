const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: 'postgresql://crm:crm@localhost:5432/crm_salvadora' });
  await client.connect();
  const res = await client.query('SELECT * FROM services ORDER BY name ASC;');
  console.log('--- SERVICIOS REGISTRADOS (' + res.rows.length + ') ---');
  console.table(res.rows);
  await client.end();
}

main();
