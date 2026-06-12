// WMS Migration — tabloları oluşturur, eksik kolonları ekler
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadServerEnv() {
  const envPath = path.join(__dirname, '.env')
  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue

    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}
loadServerEnv()

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is missing.");
  process.exit(1);
}

const STEPS = [
  {
    desc: 'warehouse_locations tablosu',
    sql: `CREATE TABLE IF NOT EXISTS public.warehouse_locations (
      id UUID DEFAULT gen_random_uuid() NOT NULL,
      branch_id UUID NOT NULL,
      zone_code TEXT,
      aisle TEXT,
      rack TEXT,
      level TEXT,
      bin TEXT,
      temperature_class TEXT,
      usage_type TEXT DEFAULT 'RESERVE',
      is_active BOOLEAN DEFAULT true NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now(),
      CONSTRAINT warehouse_locations_pkey PRIMARY KEY (id)
    )`
  },
  { desc: 'idx_warehouse_locations_branch',   sql: `CREATE INDEX IF NOT EXISTS idx_warehouse_locations_branch ON public.warehouse_locations(branch_id)` },
  {
    desc: 'warehouse_lpns tablosu',
    sql: `CREATE TABLE IF NOT EXISTS public.warehouse_lpns (
      id UUID DEFAULT gen_random_uuid() NOT NULL,
      lpn_code TEXT NOT NULL,
      branch_id UUID NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now(),
      CONSTRAINT warehouse_lpns_pkey PRIMARY KEY (id),
      CONSTRAINT warehouse_lpns_lpn_code_key UNIQUE (lpn_code)
    )`
  },
  { desc: 'idx_warehouse_lpns_branch',   sql: `CREATE INDEX IF NOT EXISTS idx_warehouse_lpns_branch   ON public.warehouse_lpns(branch_id)` },
  { desc: 'idx_warehouse_lpns_location', sql: `CREATE INDEX IF NOT EXISTS idx_warehouse_lpns_location ON public.warehouse_lpns(location_id)` },
  { desc: 'idx_warehouse_lpns_status',   sql: `CREATE INDEX IF NOT EXISTS idx_warehouse_lpns_status   ON public.warehouse_lpns(status)` },
  {
    desc: 'stock_item_warehouse_settings tablosu',
    sql: `CREATE TABLE IF NOT EXISTS public.stock_item_warehouse_settings (
      id UUID DEFAULT gen_random_uuid() NOT NULL,
      stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
      branch_id UUID NOT NULL,
      order_unit TEXT DEFAULT 'ana',
      min_order NUMERIC(10,3),
      max_order NUMERIC(10,3),
      min_stock NUMERIC(10,3),
      safety_stock NUMERIC(10,3),
      transfer_price_adjustment_type TEXT DEFAULT 'none',
      transfer_price_adjustment_value NUMERIC(18,4) DEFAULT 0,
      default_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now(),
      CONSTRAINT stock_item_warehouse_settings_pkey PRIMARY KEY (id),
      CONSTRAINT stock_item_warehouse_settings_unique_stock_branch UNIQUE (stock_item_id, branch_id)
    )`
  },
  { desc: 'idx_stock_item_wh_settings_item',   sql: `CREATE INDEX IF NOT EXISTS idx_stock_item_wh_settings_item   ON public.stock_item_warehouse_settings(stock_item_id)` },
  { desc: 'idx_stock_item_wh_settings_branch', sql: `CREATE INDEX IF NOT EXISTS idx_stock_item_wh_settings_branch ON public.stock_item_warehouse_settings(branch_id)` },
  {
    desc: 'product_external_barcodes tablosu',
    sql: `CREATE TABLE IF NOT EXISTS public.product_external_barcodes (
      id UUID DEFAULT gen_random_uuid() NOT NULL,
      gtin_barcode TEXT NOT NULL,
      stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
      is_approved BOOLEAN DEFAULT false NOT NULL,
      created_by_terminal TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now(),
      CONSTRAINT product_external_barcodes_pkey PRIMARY KEY (id)
    )`
  },
  { desc: 'idx_product_barcodes_gtin',     sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_product_barcodes_gtin ON public.product_external_barcodes(gtin_barcode)` },
  { desc: 'idx_product_barcodes_item',     sql: `CREATE INDEX IF NOT EXISTS idx_product_barcodes_item        ON public.product_external_barcodes(stock_item_id)` },
  { desc: 'idx_product_barcodes_approved', sql: `CREATE INDEX IF NOT EXISTS idx_product_barcodes_approved    ON public.product_external_barcodes(is_approved)` },
  // Mevcut tablolara eksik kolon eklemeleri (idempotent)
  { desc: 'warehouse_locations.updated_at', sql: `ALTER TABLE public.warehouse_locations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()` },
  { desc: 'warehouse_lpns.location_id',    sql: `ALTER TABLE public.warehouse_lpns ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL` },
  { desc: 'warehouse_lpns.notes',          sql: `ALTER TABLE public.warehouse_lpns ADD COLUMN IF NOT EXISTS notes TEXT` },
  { desc: 'warehouse_lpns.updated_at',     sql: `ALTER TABLE public.warehouse_lpns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()` },
  { desc: 'stock_item_wh_settings.default_location_id', sql: `ALTER TABLE public.stock_item_warehouse_settings ADD COLUMN IF NOT EXISTS default_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL` },
  { desc: 'stock_item_wh_settings.transfer_price_adjustment_type', sql: `ALTER TABLE public.stock_item_warehouse_settings ADD COLUMN IF NOT EXISTS transfer_price_adjustment_type TEXT DEFAULT 'none'` },
  { desc: 'stock_item_wh_settings.transfer_price_adjustment_value', sql: `ALTER TABLE public.stock_item_warehouse_settings ADD COLUMN IF NOT EXISTS transfer_price_adjustment_value NUMERIC(18,4) DEFAULT 0` },
  { desc: 'stock_item_wh_settings.updated_at', sql: `ALTER TABLE public.stock_item_warehouse_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()` },
  { desc: 'inventory_movements.location_id',     sql: `ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL` },
  { desc: 'inventory_movements.lpn_id',          sql: `ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS lpn_id UUID REFERENCES public.warehouse_lpns(id) ON DELETE SET NULL` },
  { desc: 'inventory_movements.lot_number',      sql: `ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS lot_number TEXT` },
  { desc: 'inventory_movements.expiration_date', sql: `ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS expiration_date DATE` },
  { desc: 'idx_inv_movements_location', sql: `CREATE INDEX IF NOT EXISTS idx_inv_movements_location ON public.inventory_movements(location_id)` },
  { desc: 'idx_inv_movements_lpn',      sql: `CREATE INDEX IF NOT EXISTS idx_inv_movements_lpn      ON public.inventory_movements(lpn_id)` },
  { desc: 'product_external_barcodes.notes',      sql: `ALTER TABLE public.product_external_barcodes ADD COLUMN IF NOT EXISTS notes TEXT` },
  { desc: 'product_external_barcodes.updated_at', sql: `ALTER TABLE public.product_external_barcodes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()` },
  // Phase 1: Tedarikçi ve Sipariş Akış Kanal Ayrımı
  { desc: 'suppliers.supplier_kind', sql: `ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS supplier_kind TEXT DEFAULT 'external'` },
  { desc: 'suppliers.source_workspace_scope', sql: `ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS source_workspace_scope TEXT` },
  { desc: 'suppliers.source_branch_id', sql: `ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS source_branch_id UUID` },
  { desc: 'suppliers.is_system_generated', sql: `ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_system_generated BOOLEAN DEFAULT false` },
  { desc: 'suppliers.sync_key', sql: `ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS sync_key TEXT` },
  { desc: 'suppliers.sync_key UNIQUE', sql: `ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_sync_key_key UNIQUE (sync_key)` },
  { desc: 'suppliers.supplier_kind CHECK', sql: `ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_supplier_kind_check CHECK (supplier_kind IN ('external', 'internal_warehouse', 'internal_kitchen'))` },
  { desc: 'purchase_orders.flow_channel', sql: `ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS flow_channel TEXT DEFAULT 'external_purchase'` },
  { desc: 'purchase_orders.flow_channel CHECK', sql: `ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_flow_channel_check CHECK (flow_channel IN ('external_purchase', 'warehouse_replenishment', 'kitchen_replenishment'))` },
  { desc: 'order_flows.flow_channel', sql: `ALTER TABLE public.order_flows ADD COLUMN IF NOT EXISTS flow_channel TEXT DEFAULT 'external_purchase'` },
  { desc: 'order_flows.flow_channel CHECK', sql: `ALTER TABLE public.order_flows ADD CONSTRAINT order_flows_flow_channel_check CHECK (flow_channel IN ('external_purchase', 'warehouse_replenishment', 'kitchen_replenishment'))` },
  // Phase 1 - Rezervasyon Motoru ve Sevkiyat Güvenliği
  {
    desc: 'warehouse_reservations tablosu',
    sql: `CREATE TABLE IF NOT EXISTS public.warehouse_reservations (
      id UUID DEFAULT gen_random_uuid() NOT NULL,
      branch_id UUID NOT NULL,
      stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
      location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
      lpn_id UUID REFERENCES public.warehouse_lpns(id) ON DELETE SET NULL,
      lot_number TEXT,
      expiration_date DATE,
      source_doc_type TEXT NOT NULL,
      source_doc_id UUID NOT NULL,
      source_line_id UUID,
      reserved_qty NUMERIC(18,4) NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      reserved_by TEXT,
      reserved_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      consumed_at TIMESTAMPTZ,
      released_at TIMESTAMPTZ,
      meta JSONB DEFAULT '{}'::jsonb NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
      CONSTRAINT warehouse_reservations_pkey PRIMARY KEY (id),
      CONSTRAINT warehouse_reservations_status_check CHECK (status IN ('active', 'consumed', 'released', 'cancelled', 'expired')),
      CONSTRAINT warehouse_reservations_qty_check CHECK (reserved_qty > 0)
    )`
  },
  { desc: 'idx_warehouse_reservations_branch', sql: `CREATE INDEX IF NOT EXISTS idx_warehouse_reservations_branch ON public.warehouse_reservations(branch_id)` },
  { desc: 'idx_warehouse_reservations_stock_item', sql: `CREATE INDEX IF NOT EXISTS idx_warehouse_reservations_stock_item ON public.warehouse_reservations(stock_item_id)` },
  { desc: 'idx_warehouse_reservations_location', sql: `CREATE INDEX IF NOT EXISTS idx_warehouse_reservations_location ON public.warehouse_reservations(location_id) WHERE location_id IS NOT NULL` },
  { desc: 'idx_warehouse_reservations_lpn', sql: `CREATE INDEX IF NOT EXISTS idx_warehouse_reservations_lpn ON public.warehouse_reservations(lpn_id) WHERE lpn_id IS NOT NULL` },
  { desc: 'idx_warehouse_reservations_status', sql: `CREATE INDEX IF NOT EXISTS idx_warehouse_reservations_status ON public.warehouse_reservations(status)` },
  { desc: 'idx_warehouse_reservations_source', sql: `CREATE INDEX IF NOT EXISTS idx_warehouse_reservations_source ON public.warehouse_reservations(source_doc_type, source_doc_id)` },
  {
    desc: 'v_wms_pickable_stock view',
    sql: `CREATE OR REPLACE VIEW public.v_wms_pickable_stock AS
    WITH physical_stock AS (
      SELECT
        branch_id,
        stock_item_id,
        location_id,
        lpn_id,
        lot_number,
        expiration_date,
        SUM(CASE WHEN direction = 'in' THEN quantity ELSE -quantity END) AS physical_qty
      FROM public.inventory_movements
      WHERE deleted_at IS NULL
        AND is_cancelled = false
        AND COALESCE(meta->>'availability_status', 'available') NOT IN ('quarantine', 'putaway_pending')
      GROUP BY
        branch_id,
        stock_item_id,
        location_id,
        lpn_id,
        lot_number,
        expiration_date
    ),
    reserved_stock AS (
      SELECT
        branch_id,
        stock_item_id,
        location_id,
        lpn_id,
        lot_number,
        expiration_date,
        SUM(reserved_qty) AS reserved_qty
      FROM public.warehouse_reservations
      WHERE status = 'active'
      GROUP BY
        branch_id,
        stock_item_id,
        location_id,
        lpn_id,
        lot_number,
        expiration_date
    )
    SELECT
      p.branch_id,
      p.stock_item_id,
      p.location_id,
      p.lpn_id,
      p.lot_number,
      p.expiration_date,
      p.physical_qty,
      COALESCE(r.reserved_qty, 0::numeric) AS reserved_qty,
      GREATEST(p.physical_qty - COALESCE(r.reserved_qty, 0::numeric), 0::numeric) AS pickable_qty
    FROM physical_stock p
    LEFT JOIN reserved_stock r ON
      p.branch_id = r.branch_id AND
      p.stock_item_id = r.stock_item_id AND
      (p.location_id = r.location_id OR (p.location_id IS NULL AND r.location_id IS NULL)) AND
      (p.lpn_id = r.lpn_id OR (p.lpn_id IS NULL AND r.lpn_id IS NULL)) AND
      (p.lot_number = r.lot_number OR (p.lot_number IS NULL AND r.lot_number IS NULL)) AND
      (p.expiration_date = r.expiration_date OR (p.expiration_date IS NULL AND r.expiration_date IS NULL))
    WHERE p.physical_qty > 0`
  },
  {
    desc: 'create_warehouse_shipment_with_reservations RPC ve confirm_warehouse_shipment güncellemesi',
    sql: fs.readFileSync(path.join(__dirname, '../migrations/038_create_shipment_reservation_rpc.sql'), 'utf8')
  },
  {
    desc: 'confirm_warehouse_shipment rezervasyon doğrulama ve cancel_warehouse_shipment RPC',
    sql: fs.readFileSync(path.join(__dirname, '../migrations/039_confirm_shipment_reservations_validation.sql'), 'utf8')
  },
  {
    desc: 'warehouse_tasks ve warehouse_task_events tabloları (WMS-02A)',
    sql: fs.readFileSync(path.join(__dirname, '../migrations/040_add_warehouse_tasks.sql'), 'utf8')
  },
  {
    desc: 'complete_warehouse_putaway_task RPC fonksiyonu (WMS-02B)',
    sql: fs.readFileSync(path.join(__dirname, '../migrations/041_complete_putaway_task_rpc.sql'), 'utf8')
  },
  {
    desc: 'inventory_movements otomatik putaway task trigger (WMS-02B)',
    sql: fs.readFileSync(path.join(__dirname, '../migrations/042_putaway_task_trigger.sql'), 'utf8')
  },
  {
    desc: 'wms shipment pick/pack/load tasks, complete and confirm/cancel guards (WMS-02C)',
    sql: fs.readFileSync(path.join(__dirname, '../migrations/043_wms_shipment_tasks_rpc.sql'), 'utf8')
  },
  {
    desc: 'wms task exception resolution RPC (WMS-02D)',
    sql: fs.readFileSync(path.join(__dirname, '../migrations/044_wms_task_exception_rpc.sql'), 'utf8')
  },
  {
    desc: 'wms evidence photo support in task events (WMS-03F)',
    sql: fs.readFileSync(path.join(__dirname, '../migrations/045_add_evidence_photo_to_task_events.sql'), 'utf8')
  },
  {
    desc: 'wms packaging and capacity schema and functions (WMS-03G)',
    sql: fs.readFileSync(path.join(__dirname, '../migrations/046_wms_packaging_and_capacity_schema.sql'), 'utf8')
  }
]

async function run() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('DB baglantisi kuruldu\n')

  let ok = 0, skip = 0, fail = 0
  for (const step of STEPS) {
    try {
      await client.query(step.sql)
      console.log('  OK  ' + step.desc)
      ok++
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        console.log('  --  ' + step.desc + ' (zaten var)')
        skip++
      } else {
        console.error('  ERR ' + step.desc + ': ' + err.message)
        fail++
      }
    }
  }

  console.log('\nToplam: ' + STEPS.length + ' | OK: ' + ok + ' | Skip: ' + skip + ' | ERR: ' + fail)

  const r1 = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='warehouse_lpns' ORDER BY column_name")
  console.log('\nwarehouse_lpns kolonlari: ' + r1.rows.map(r => r.column_name).join(', '))

  const r2 = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_movements' AND column_name IN ('location_id','lpn_id','lot_number','expiration_date') ORDER BY column_name")
  console.log('inventory_movements yeni kolonlar: ' + (r2.rows.map(r => r.column_name).join(', ') || 'BULUNAMADI'))

  const r3 = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('warehouse_locations','warehouse_lpns','stock_item_warehouse_settings','product_external_barcodes') ORDER BY table_name")
  console.log('WMS tablolari: ' + r3.rows.map(r => r.table_name).join(', '))

  await client.end()
  if (fail > 0) process.exit(1)
}

run().catch(err => { console.error(err.message); process.exit(1) })
