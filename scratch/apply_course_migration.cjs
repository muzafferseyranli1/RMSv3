const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway',
});

async function run() {
  try {
    console.log('Connecting to database...');
    
    console.log('Altering sales_status_check constraint...');
    await pool.query(`
      ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_check;
      ALTER TABLE public.sales ADD CONSTRAINT sales_status_check CHECK (status = ANY (ARRAY['completed'::text, 'cancelled'::text, 'refunded'::text, 'partially_refunded'::text, 'active'::text]));
    `);
    console.log('sales_status_check constraint updated.');

    console.log('Adding default_course column to sale_items...');
    await pool.query(`
      ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS default_course TEXT DEFAULT 'main_dish';
    `);
    console.log('default_course column verified/added.');

    console.log('Adding columns to sale_lines...');
    await pool.query(`
      ALTER TABLE public.sale_lines ADD COLUMN IF NOT EXISTS course_type TEXT DEFAULT 'main_dish';
      ALTER TABLE public.sale_lines ADD COLUMN IF NOT EXISTS course_status TEXT DEFAULT 'fire';
      ALTER TABLE public.sale_lines ADD COLUMN IF NOT EXISTS fired_at TIMESTAMPTZ DEFAULT now();
    `);
    console.log('course_type, course_status, fired_at columns verified/added.');

    console.log('Course Migration successfully completed!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

run();
