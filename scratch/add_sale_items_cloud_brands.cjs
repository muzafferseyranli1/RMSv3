const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  const pool = new Pool({ connectionString, ssl: false });
  try {
    await pool.query(`
      ALTER TABLE sale_items 
      ADD COLUMN IF NOT EXISTS cloud_brands jsonb DEFAULT '[]'::jsonb;
    `);
    console.log('Successfully added cloud_brands jsonb column to sale_items table!');
  } catch (err) {
    console.error('Err adding column:', err);
  } finally {
    await pool.end();
  }
}
main();
