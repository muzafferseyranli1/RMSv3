const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  const pool = new Pool({ connectionString, ssl: false });
  try {
    const client = await pool.connect();
    console.log('Connected to DB');
    
    // Check columns of company_nodes
    const colsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'company_nodes'
      ORDER BY ordinal_position;
    `);
    console.log('company_nodes columns:', colsRes.rows);

    const nodesRes = await client.query(`SELECT id, type, name, parent_id FROM company_nodes LIMIT 20;`);
    console.log('company_nodes count:', nodesRes.rowCount, 'sample:', nodesRes.rows);

    const settingsRes = await client.query(`SELECT value FROM settings WHERE key = 'company_tree' LIMIT 1;`);
    if (settingsRes.rows.length > 0) {
      console.log('settings company_tree top level:', JSON.stringify(settingsRes.rows[0].value, null, 2).slice(0, 500));
    }

    client.release();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
