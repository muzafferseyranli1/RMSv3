const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  const pool = new Pool({
    connectionString,
    ssl: false,
  });

  try {
    console.log('Connecting to VPS PostgreSQL...');
    const client = await pool.connect();
    console.log('Connected! Reading Phase 4 SQL schema file...');

    const sqlPath = path.resolve(__dirname, '..', 'sql', 'einvoice_phase4_eadisyon_schema.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing einvoice_phase4_eadisyon_schema.sql...');
    await client.query(sqlContent);
    console.log('Phase 4 Schema executed successfully!');

    // Verify e_adisyons table
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('e_adisyons', 'e_adisyon_items')
      ORDER BY table_name;
    `);

    console.log('Verified Phase 4 tables:', tablesRes.rows.map(r => r.table_name));

    client.release();
  } catch (err) {
    console.error('Error applying Phase 4 migration:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
