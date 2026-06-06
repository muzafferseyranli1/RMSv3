const { Pool } = require('pg');
require('dotenv').config({ path: './server/.env' });

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

async function check() {
  try {
    const r = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'manual%' ORDER BY table_name;"
    );
    console.log('MANUAL TABLOLARI:', JSON.stringify(r.rows));

    const r2 = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );
    console.log('TUM TABLOLAR:', r2.rows.map(x => x.table_name).join(', '));
  } catch(e) {
    console.error('HATA:', e.message);
  } finally {
    pool.end();
  }
}

check();
