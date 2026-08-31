const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:W39xlpS9@192.168.1.17:5433/postgres',
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL on 192.168.1.17:5433!');
    
    // Check if crm_salvadora exists
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'crm_salvadora'");
    if (res.rows.length === 0) {
      console.log('Creating database crm_salvadora...');
      await client.query('CREATE DATABASE crm_salvadora;');
      console.log('Database crm_salvadora created successfully!');
    } else {
      console.log('Database crm_salvadora already exists.');
    }
  } catch (err) {
    console.error('Error creating database:', err.message);
  } finally {
    await client.end();
  }
}

main();
