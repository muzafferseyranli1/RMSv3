const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Connected to Database');

  const migrationPath = path.join(__dirname, '../migrations/055_kiosk_operating_hours_rules.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Executing migration 055...');
  await client.query(sql);
  console.log('Migration executed successfully!');

  await client.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
