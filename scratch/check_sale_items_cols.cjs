const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  const pool = new Pool({ connectionString, ssl: false });
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sale_items' AND column_name = 'cloud_brands';
    `);
    console.log('cloud_brands column in sale_items:', res.rows);
  } catch (err) {
    console.error('Err:', err);
  } finally {
    await pool.end();
  }
}
main();
