import pg from 'pg';
const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is missing.");
  process.exit(1);
}

const queries = [
  // 1. suppliers table columns
  `ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS supplier_kind TEXT DEFAULT 'external'`,
  `ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS source_workspace_scope TEXT`,
  `ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS source_branch_id UUID`,
  `ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_system_generated BOOLEAN DEFAULT false`,
  `ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS sync_key TEXT`,

  // 2. suppliers constraints
  `ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_sync_key_key`,
  `ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_sync_key_key UNIQUE (sync_key)`,
  `ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_supplier_kind_check`,
  `ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_supplier_kind_check CHECK (supplier_kind IN ('external', 'internal_warehouse', 'internal_kitchen'))`,

  // 3. Set existing records supplier_kind to 'external' if null
  `UPDATE public.suppliers SET supplier_kind = 'external' WHERE supplier_kind IS NULL`,

  // 4. purchase_orders table updates
  `ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS flow_channel TEXT DEFAULT 'external_purchase'`,
  `ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_flow_channel_check`,
  `ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_flow_channel_check CHECK (flow_channel IN ('external_purchase', 'warehouse_replenishment', 'kitchen_replenishment'))`,
  `UPDATE public.purchase_orders SET flow_channel = 'external_purchase' WHERE flow_channel IS NULL`,

  // 5. order_flows table updates
  `ALTER TABLE public.order_flows ADD COLUMN IF NOT EXISTS flow_channel TEXT DEFAULT 'external_purchase'`,
  `ALTER TABLE public.order_flows DROP CONSTRAINT IF EXISTS order_flows_flow_channel_check`,
  `ALTER TABLE public.order_flows ADD CONSTRAINT order_flows_flow_channel_check CHECK (flow_channel IN ('external_purchase', 'warehouse_replenishment', 'kitchen_replenishment'))`,
  `UPDATE public.order_flows SET flow_channel = 'external_purchase' WHERE flow_channel IS NULL`
];

async function run() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Railway PostgreSQL database.');

    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      console.log(`Executing query ${i + 1}/${queries.length}: ${q.substring(0, 80)}...`);
      await client.query(q);
    }

    console.log('All queries executed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
