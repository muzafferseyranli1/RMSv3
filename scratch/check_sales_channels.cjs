const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  const pool = new Pool({ connectionString, ssl: false });
  try {
    const res = await pool.query(`SELECT id, name, active, deleted_at, sort_order FROM sales_channels ORDER BY sort_order;`);
    console.log('sales_channels in VPS Postgres:', res.rows);
  } catch (err) {
    console.error('Err:', err);
  } finally {
    await pool.end();
  }
}
main();
