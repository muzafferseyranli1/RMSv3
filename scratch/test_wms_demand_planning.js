import pg from 'pg';
const { Client } = pg;
import { calculateWarehouseDemand } from '../src/lib/warehouseDemandPlanning.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required. Refusing to run WMS demand planning test without an explicit connection string.');
}

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  let failed = false;

  try {
    await client.connect();
    console.log('Connected to database.');
    await client.query('BEGIN;');
    console.log('Started transaction.');

    // 1. Resolve anadepo and sube nodes
    const warehouseNodeRes = await client.query("SELECT id, name FROM public.company_nodes WHERE type = 'anadepo' LIMIT 1;");
    const subeNodeRes = await client.query("SELECT id, name FROM public.company_nodes WHERE type = 'sube' LIMIT 1;");

    if (warehouseNodeRes.rows.length === 0 || subeNodeRes.rows.length === 0) {
      console.log('Missing required company nodes of type "anadepo" or "sube". Skipping test.');
      await client.query('ROLLBACK;');
      await client.end();
      return;
    }

    const warehouseNode = warehouseNodeRes.rows[0];
    const subeNode = subeNodeRes.rows[0];

    console.log(`Warehouse Branch: ${warehouseNode.name} (ID: ${warehouseNode.id})`);
    console.log(`Sube Branch: ${subeNode.name} (ID: ${subeNode.id})`);

    // 2. Resolve a stock item
    const itemRes = await client.query('SELECT id, name, sku, unit, min_stock, max_stock, order_unit, min_order, max_order, packaging_units, recipe_linked FROM public.stock_items WHERE deleted_at IS NULL LIMIT 1;');
    if (itemRes.rows.length === 0) {
      console.log('No active stock item found. Skipping test.');
      await client.query('ROLLBACK;');
      await client.end();
      return;
    }

    const item = itemRes.rows[0];
    console.log(`Stock Item: ${item.name} (ID: ${item.id}, Min Order: ${item.min_order}, Max Order: ${item.max_order})`);

    // 3. Insert settings into stock_item_warehouse_settings for the warehouse
    const settingId = 'test-setting-id-12345';
    await client.query(
      `INSERT INTO public.stock_item_warehouse_settings (id, stock_item_id, branch_id, order_unit, min_order, max_order, min_stock, safety_stock)
       VALUES (gen_random_uuid(), $1, $2, 'koli', 2.0, 10.0, 5.0, 3.0)
       ON CONFLICT (stock_item_id, branch_id)
       DO UPDATE SET min_stock = 5.0, safety_stock = 3.0, min_order = 2.0, max_order = 10.0, order_unit = 'koli';`,
      [item.id, warehouseNode.id]
    );
    console.log('Inserted stock_item_warehouse_settings for the warehouse.');

    // 4. Read warehouse settings back to verify
    const settingsCheck = await client.query(
      `SELECT * FROM public.stock_item_warehouse_settings WHERE stock_item_id = $1 AND branch_id = $2;`,
      [item.id, warehouseNode.id]
    );
    const settingsRow = settingsCheck.rows[0];
    console.log(`Verified warehouse settings - min_stock: ${settingsRow.min_stock}, safety_stock: ${settingsRow.safety_stock}`);

    // 5. Setup test inputs for calculateWarehouseDemand
    const warehouseBranchId = warehouseNode.id;
    const connectedBranches = [subeNode];
    const planningDays = 7;

    // We configure packaging units for the stock item. Mock koli factor = 10
    const mockedItem = {
      ...item,
      packaging_units: JSON.stringify([{ unit: 'koli', qty: 10 }])
    };

    // Scenario A: Qty Mode "tahmin" (Recipe usage)
    // Formula: Suggested = (GrossDemand - branch_coverage) + safetyQty - warehousePosition
    // In this test:
    // - Sube gross demand: 50 units
    // - Sube available stock: 10 units. Sube outbound yolda: 5 units. Coverage = 15 units.
    // - Sube net demand: 50 - 15 = 35 units.
    // - Warehouse available stock: 5 units. Inbound to warehouse: 10 units. WarehousePosition = 15 units.
    // - Warehouse safety stock: 3 units.
    // - SuggestedQty = 35 + 3 - 15 = 23 units.
    // - Since order unit is 'koli' (factor = 10) and round_box_qty is true, 23 rounds up to 3 koli = 30 units.
    // - Min order is 2 koli (20 units), Max order is 10 koli (100 units). 30 is within bounds.
    // Let's verify if calculateWarehouseDemand outputs exactly 30 suggested units!

    const multiBranchBalances = new Map([
      [`${subeNode.id}:${item.id}`, 10]
    ]);
    const warehouseBalances = new Map([
      [item.id, 5]
    ]);
    const inboundWarehouseQtyMap = new Map([
      [item.id, 10]
    ]);
    const outboundReplenishingQtyMap = new Map([
      [`${subeNode.id}:${item.id}`, 5]
    ]);
    const multiBranchDailyUsageMap = new Map([
      [`${subeNode.id}:${item.id}`, 5]
    ]);
    const multiBranchRecipeForecastMap = new Map([
      [`${subeNode.id}:${item.id}`, 50] // Mock recipe usage
    ]);
    const lastOrderQtyMap = new Map();
    const warehouseSettingsMap = new Map([
      [item.id, settingsRow]
    ]);

    const flowTahmin = {
      qty_mode: 'tahmin',
      round_box_qty: true,
      round_box_threshold: 0.2, // rounds up since 2.3 > 2.2
      round_min_qty: true,
      forecast_ratio: 1.0
    };

    // Mock item properties to force recipe_linked
    mockedItem.recipe_linked = true;

    const resultsTahmin = calculateWarehouseDemand({
      warehouseBranchId,
      flow: flowTahmin,
      stockItems: [mockedItem],
      connectedBranches,
      planningDays,
      multiBranchBalances,
      warehouseBalances,
      inboundWarehouseQtyMap,
      outboundReplenishingQtyMap,
      multiBranchDailyUsageMap,
      multiBranchRecipeForecastMap,
      lastOrderQtyMap,
      warehouseSettingsMap,
    });

    const rTahmin = resultsTahmin[0];
    console.log(`\n--- TEST RESULTS: TAHMIN MODE ---`);
    console.log(`Suggested Qty: ${rTahmin.suggested_qty} (Expected: 30)`);
    console.log(`Explanation: ${rTahmin.meta.forecast.qty_mode_explanation}`);
    console.log(`Rounding: ${rTahmin.meta.forecast.rounding_reason}`);

    if (rTahmin.suggested_qty === 30) {
      console.log('Tahmin Mode Test PASS!');
    } else {
      console.log('Tahmin Mode Test FAIL!');
      failed = true;
    }

    // Scenario B: Qty Mode "stok" (Stock top-up mode)
    // Formula: Suggested = target - warehouseAvail - inboundYolda
    // warehouseAvail: 5. inboundYolda: 10.
    // Target is max_stock if > 0, else min_stock + safety_stock.
    // Let's set max_stock = 50 in settingsRow or mockedItem.
    // Let's mock settings to have max_order / min_order / max_stock.
    // If maxStock is mock item max_stock = 40.
    // Suggested = 40 - 5 - 10 = 25 units.
    // Rounds up to 3 koli = 30 units.
    const settingsStok = {
      ...settingsRow,
      min_stock: 10,
      safety_stock: 5,
    };
    const mockedItemStok = {
      ...mockedItem,
      max_stock: 40
    };

    const flowStok = {
      qty_mode: 'stok',
      round_box_qty: true,
      round_box_threshold: 0.2,
      round_min_qty: true
    };

    const resultsStok = calculateWarehouseDemand({
      warehouseBranchId,
      flow: flowStok,
      stockItems: [mockedItemStok],
      connectedBranches,
      planningDays,
      multiBranchBalances,
      warehouseBalances,
      inboundWarehouseQtyMap,
      outboundReplenishingQtyMap,
      multiBranchDailyUsageMap,
      multiBranchRecipeForecastMap,
      lastOrderQtyMap,
      warehouseSettingsMap: new Map([[item.id, settingsStok]]),
    });

    const rStok = resultsStok[0];
    console.log(`\n--- TEST RESULTS: STOK MODE ---`);
    console.log(`Suggested Qty: ${rStok.suggested_qty} (Expected: 30)`);
    console.log(`Explanation: ${rStok.meta.forecast.qty_mode_explanation}`);

    if (rStok.suggested_qty === 30) {
      console.log('Stok Mode Test PASS!');
    } else {
      console.log('Stok Mode Test FAIL!');
      failed = true;
    }

    if (failed) {
      process.exitCode = 1;
    }
    console.log('\nAll integration tests executed.');

  } catch (err) {
    console.error('Test failed with error:', err);
    process.exitCode = 1;
  } finally {
    await client.query('ROLLBACK;');
    console.log('Transaction rolled back. DB is clean.');
    await client.end();
  }
}

main();
