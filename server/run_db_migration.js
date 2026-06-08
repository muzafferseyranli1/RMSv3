const { Pool } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL environment variable is missing.");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString,
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
