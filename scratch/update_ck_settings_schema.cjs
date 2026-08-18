const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  const pool = new Pool({ connectionString, ssl: false });
  try {
    await pool.query(`
      ALTER TABLE public.cloud_kitchen_settings 
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS primary_brand_id UUID;
    `);
    console.log('Successfully added is_active & primary_brand_id columns to cloud_kitchen_settings!');
  } catch (err) {
    console.error('Err adding columns:', err);
  } finally {
    await pool.end();
  }
}
main();
