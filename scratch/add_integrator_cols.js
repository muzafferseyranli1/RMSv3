import pg from 'pg';

const NEW_PG_URL = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function addIntegratorPortalCols() {
  const pool = new pg.Pool({ connectionString: NEW_PG_URL });
  console.log('Adding integrator portal tracking columns to e_invoices...');
  try {
    await pool.query(`
      ALTER TABLE public.e_invoices ADD COLUMN IF NOT EXISTS is_synced_to_rms BOOLEAN DEFAULT true;
      ALTER TABLE public.e_invoices ADD COLUMN IF NOT EXISTS integrator_provider VARCHAR(50) DEFAULT 'sandbox';
      ALTER TABLE public.e_invoices ADD COLUMN IF NOT EXISTS envelope_uuid UUID DEFAULT gen_random_uuid();
      ALTER TABLE public.e_invoices ADD COLUMN IF NOT EXISTS gib_status_detail TEXT;
    `);
    console.log('✅ Columns added successfully to PostgreSQL database!');
  } catch (err) {
    console.error('Error adding columns:', err);
  } finally {
    await pool.end();
  }
}

addIntegratorPortalCols();
