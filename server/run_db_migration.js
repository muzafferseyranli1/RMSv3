const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway',
  });
  try {
    console.log('Connected to PG. Running schema migrations...');
    
    // Add is_completed column to task_participants
    await pool.query(`
      ALTER TABLE public.task_participants 
      ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;
    `);
    console.log('Added is_completed to task_participants successfully.');
  } catch (e) {
    console.error('Migration failed:', e);
  } finally {
    await pool.end();
  }
}

main();
