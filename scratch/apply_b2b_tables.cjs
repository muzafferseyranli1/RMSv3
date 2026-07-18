const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log('Connecting to database...');
    
    // 1. Add B2B columns to public.musteriler
    await pool.query(`
      ALTER TABLE public.musteriler 
      ADD COLUMN IF NOT EXISTS is_b2b BOOLEAN DEFAULT false NOT NULL,
      ADD COLUMN IF NOT EXISTS tax_office TEXT,
      ADD COLUMN IF NOT EXISTS b2b_price_list JSONB DEFAULT '{}'::jsonb NOT NULL;
    `);
    console.log('Columns is_b2b, tax_office, b2b_price_list added/verified on public.musteriler.');

    // 2. Create b2b_sales_orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.b2b_sales_orders (
        id UUID DEFAULT gen_random_uuid() NOT NULL,
        order_no TEXT NOT NULL,
        seller_branch_id UUID NOT NULL,
        seller_branch_name TEXT,
        seller_scope TEXT NOT NULL,
        customer_id UUID NOT NULL,
        customer_name TEXT NOT NULL,
        customer_tax_no TEXT,
        customer_tax_office TEXT,
        order_date TIMESTAMPTZ DEFAULT now() NOT NULL,
        delivery_date DATE,
        status TEXT DEFAULT 'pending' NOT NULL,
        doc_kind TEXT DEFAULT 'İrsaliye',
        doc_no TEXT,
        plate_number TEXT,
        notes TEXT,
        subtotal NUMERIC(14,4) DEFAULT 0 NOT NULL,
        vat_total NUMERIC(14,4) DEFAULT 0 NOT NULL,
        total_amount NUMERIC(14,4) DEFAULT 0 NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        deleted_at TIMESTAMPTZ,
        CONSTRAINT b2b_sales_orders_pkey PRIMARY KEY (id),
        CONSTRAINT b2b_sales_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.musteriler(id)
      );
    `);
    console.log('Table public.b2b_sales_orders created/verified.');

    // 3. Create b2b_sales_order_lines table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.b2b_sales_order_lines (
        id UUID DEFAULT gen_random_uuid() NOT NULL,
        order_id UUID NOT NULL,
        line_no INTEGER NOT NULL,
        item_type TEXT NOT NULL,
        stock_item_id UUID,
        semi_item_id UUID,
        item_name TEXT NOT NULL,
        item_sku TEXT,
        unit TEXT,
        unit_price NUMERIC(14,4) DEFAULT 0 NOT NULL,
        vat_rate NUMERIC(6,4) DEFAULT 0 NOT NULL,
        ordered_qty NUMERIC(14,4) NOT NULL,
        shipped_qty NUMERIC(14,4) DEFAULT 0 NOT NULL,
        line_total NUMERIC(14,4) DEFAULT 0 NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT b2b_sales_order_lines_pkey PRIMARY KEY (id),
        CONSTRAINT b2b_sales_order_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.b2b_sales_orders(id) ON DELETE CASCADE
      );
    `);
    console.log('Table public.b2b_sales_order_lines created/verified.');

    console.log('B2B DB Migration successfully completed!');
  } catch (err) {
    console.error('B2B Migration failed:', err);
  } finally {
    await pool.end();
  }
}

run();
