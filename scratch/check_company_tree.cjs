const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  const pool = new Pool({ connectionString, ssl: false });
  try {
    const res = await pool.query(`SELECT value FROM settings WHERE key = 'company_tree';`);
    console.log('company_tree row:', res.rows[0]);
    console.log('value type:', typeof res.rows[0]?.value, Array.isArray(res.rows[0]?.value));
  } catch (err) {
    console.error('Err:', err);
  } finally {
    await pool.end();
  }
}
main();
