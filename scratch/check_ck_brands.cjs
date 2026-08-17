const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  const pool = new Pool({ connectionString, ssl: false });
  try {
    const res = await pool.query(`SELECT id, name, kitchen_station FROM cloud_kitchen_brands;`);
    console.log('Current cloud_kitchen_brands rows:', res.rows);
  } catch (err) {
    console.error('Err:', err);
  } finally {
    await pool.end();
  }
}
main();
