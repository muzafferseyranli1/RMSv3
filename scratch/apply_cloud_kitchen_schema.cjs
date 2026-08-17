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
    console.log('Connected! Reading Cloud Kitchen SQL schema file...');

    const sqlPath = path.resolve(__dirname, '..', 'sql', 'cloud_kitchen_schema.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing cloud_kitchen_schema.sql...');
    await client.query(sqlContent);
    console.log('Cloud Kitchen Schema executed successfully!');

    // Verify table
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'cloud_kitchen_brands';
    `);

    console.log('Verified Cloud Kitchen tables:', tablesRes.rows.map(r => r.table_name));

    client.release();
  } catch (err) {
    console.error('Error applying Cloud Kitchen migration:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
