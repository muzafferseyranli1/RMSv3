const { Client } = require('pg');

const connectionString = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB.');

    // Try renaming the column created_by_personel_id (single 'l') to created_by_personnel_id (double 'l')
    try {
      console.log('Attempting to rename created_by_personel_id to created_by_personnel_id...');
      await client.query(`
        ALTER TABLE public.tasks 
        RENAME COLUMN created_by_personel_id TO created_by_personnel_id;
      `);
      console.log('Success! Column renamed.');
    } catch (e) {
      console.log('Rename failed or column already correct:', e.message);
    }

    // Try renaming the index if exists
    try {
      await client.query(`
        ALTER INDEX IF EXISTS idx_tasks_created_by_personel_id 
        RENAME TO idx_tasks_created_by_personnel_id;
      `);
      console.log('Success! Index renamed.');
    } catch (e) {
      console.log('Index rename skipped:', e.message);
    }

    // Let's print the current columns of the tasks table to be 100% sure
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tasks'
      ORDER BY column_name;
    `);
    console.log('\n--- CURRENT TASKS COLUMNS ---');
    console.log(res.rows.map(r => `${r.column_name} (${r.data_type}, nullable: ${r.is_nullable})`));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
