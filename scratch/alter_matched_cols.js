import pg from 'pg';

const NEW_PG_URL = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function alterColumns() {
  const pool = new pg.Pool({ connectionString: NEW_PG_URL });
  console.log('Altering e_invoices and e_invoice_lines columns...');
  try {
    await pool.query(`
      ALTER TABLE public.e_invoices ADD COLUMN IF NOT EXISTS matched_receipt_id UUID;
      ALTER TABLE public.e_invoices ADD COLUMN IF NOT EXISTS matched_purchase_order_id UUID;
      ALTER TABLE public.e_invoices ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ;
      ALTER TABLE public.e_invoices ADD COLUMN IF NOT EXISTS response_code VARCHAR(20);
      ALTER TABLE public.e_invoices ADD COLUMN IF NOT EXISTS response_date TIMESTAMPTZ;
      ALTER TABLE public.e_invoices ADD COLUMN IF NOT EXISTS response_reason TEXT;
      ALTER TABLE public.e_invoice_lines ADD COLUMN IF NOT EXISTS matched_stock_item_id UUID;
      ALTER TABLE public.e_invoice_lines ADD COLUMN IF NOT EXISTS matched_receipt_line_id UUID;
    `);
    console.log('✅ Columns added successfully to PostgreSQL database!');
  } catch (err) {
    console.error('Error altering columns:', err);
  } finally {
    await pool.end();
  }
}

alterColumns();
