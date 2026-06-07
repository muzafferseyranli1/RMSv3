const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';
const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Connected to Railway PostgreSQL database.');

  const sqlPath = path.join(__dirname, '..', 'migrations', '029_add_task_cost_rule_and_links.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Executing migration SQL...');
  await client.query(sql);
  console.log('Migration executed successfully!');

  // Verify the columns exist
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'tasks' AND table_schema = 'public'
    AND column_name IN ('requires_cost_input', 'linked_entity_table', 'linked_entity_id')
  `);
  
  console.log('Verification:');
  console.log(res.rows);

  await client.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
