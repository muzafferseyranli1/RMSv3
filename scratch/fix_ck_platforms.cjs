const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  const pool = new Pool({ connectionString, ssl: false });
  try {
    await pool.query(`UPDATE cloud_kitchen_brands SET platforms = '["Online Yemek", "Gel Al", "Hızlı Satış"]'::jsonb WHERE name LIKE '%Burger%';`);
    await pool.query(`UPDATE cloud_kitchen_brands SET platforms = '["Online Yemek", "Call Center"]'::jsonb WHERE name LIKE '%Taco%';`);
    await pool.query(`UPDATE cloud_kitchen_brands SET platforms = '["Online Yemek", "QR Menü"]'::jsonb WHERE name LIKE '%Bowl%';`);
    const res = await pool.query(`SELECT id, name, platforms FROM cloud_kitchen_brands;`);
    console.log('Fixed rows in cloud_kitchen_brands:', res.rows);
  } catch (err) {
    console.error('Fix err:', err);
  } finally {
    await pool.end();
  }
}
main();
