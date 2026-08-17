const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  const pool = new Pool({ connectionString, ssl: false });
  try {
    // Test updating platforms as JSON string or JSON object in pg
    const testArr = ['Online Yemek', 'Gel Al'];
    const res = await pool.query(`UPDATE cloud_kitchen_brands SET platforms = $1 WHERE name = 'Burger Lab (Virtual)' RETURNING *;`, [JSON.stringify(testArr)]);
    console.log('Update success! Row platforms:', res.rows[0].platforms, typeof res.rows[0].platforms);
  } catch (err) {
    console.error('Update error:', err);
  } finally {
    await pool.end();
  }
}
main();
