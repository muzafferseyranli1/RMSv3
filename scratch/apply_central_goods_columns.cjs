const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log('Connecting to database...');
    
    // Add columns to stock_items table if they don't exist
    await pool.query(`
      ALTER TABLE public.stock_items 
      ADD COLUMN IF NOT EXISTS is_central_warehouse_good BOOLEAN DEFAULT false NOT NULL,
      ADD COLUMN IF NOT EXISTS central_warehouses JSONB DEFAULT '[]'::jsonb NOT NULL,
      ADD COLUMN IF NOT EXISTS is_central_kitchen_good BOOLEAN DEFAULT false NOT NULL,
      ADD COLUMN IF NOT EXISTS central_kitchens JSONB DEFAULT '[]'::jsonb NOT NULL;
    `);
    console.log('Columns is_central_warehouse_good, central_warehouses, is_central_kitchen_good, central_kitchens verified/added to public.stock_items.');

    console.log('Migration successfully completed!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

run();
