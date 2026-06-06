const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function run() {
  const sqlPath = path.join(__dirname, '../migrations/026_add_equipment_and_financial_form_support.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Migration file not found at:', sqlPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('Connecting to database...');
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('Connected successfully. Executing migration SQL...');
    await client.query(sql);
    console.log('Migration executed successfully! New tables and columns created, seed data inserted.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
