const { Client } = require('pg');
async function run() {
  const client = new Client({ connectionString: 'postgresql://crm:crm@localhost:5432/crm_salvadora' });
  await client.connect();
  const res = await client.query('SELECT "agentKey", "openrouterApiKey", model FROM agent_configs;');
  console.log('Local agent_configs:', res.rows);
  await client.end();
}
run();
