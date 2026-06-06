const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.VITE_SUPABASE_URL,
});

async function run() {
  try {
    const res = await pool.query('ALTER TABLE manual_pages ADD COLUMN IF NOT EXISTS metadata JSONB;');
    console.log('Successfully added metadata column to manual_pages.', res.command);
  } catch (err) {
    console.error('Error altering table:', err.message);
  } finally {
    pool.end();
  }
}

run();
