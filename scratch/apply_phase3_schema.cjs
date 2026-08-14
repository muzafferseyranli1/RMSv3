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
    console.log('Connected! Reading SQL schema file...');

    const sqlPath = path.resolve(__dirname, '..', 'sql', 'einvoice_phase3_company_schema.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing einvoice_phase3_company_schema.sql...');
    await client.query(sqlContent);
    console.log('Phase 3 Schema executed successfully!');

    // Verify company_nodes columns
    const colsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'company_nodes' AND column_name IN ('tax_number', 'legal_title', 'is_legal_entity')
      ORDER BY column_name;
    `);

    console.log('Verified company_nodes columns:', colsRes.rows);

    client.release();
  } catch (err) {
    console.error('Error applying Phase 3 migration:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
