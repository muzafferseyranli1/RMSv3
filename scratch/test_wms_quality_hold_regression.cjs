const { Client } = require('pg');

const fs = require('fs');
const path = require('path');

function loadServerEnv() {
  const envPath = path.join(__dirname, '../server/.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadServerEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is missing. Please define it in environment variables.");
  process.exit(1);
}

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB successfully.');
    await client.query('BEGIN;');
    console.log('Started transaction (BEGIN).');

    // 1. Get mock data
    const branchRes = await client.query("SELECT id, name FROM public.company_nodes WHERE type IN ('sube', 'anadepo', 'branch') LIMIT 1;");
    if (branchRes.rows.length === 0) {
      console.log('No branches found to run test. Skipping.');
      return;
    }
    const branch = branchRes.rows[0];

    const itemRes = await client.query('SELECT id, name, sku, unit FROM public.stock_items WHERE deleted_at IS NULL LIMIT 1;');
    if (itemRes.rows.length === 0) {
      console.log('No stock items found to run test. Skipping.');
      return;
    }
    const item = itemRes.rows[0];

    // Find or create a warehouse location
    let locationRes = await client.query(`SELECT id FROM public.warehouse_locations WHERE branch_id = $1 LIMIT 1;`, [branch.id]);
    let locationId;
    if (locationRes.rows.length === 0) {
      const newLoc = await client.query(
        `INSERT INTO public.warehouse_locations (branch_id, zone_code, aisle, rack, level, bin, usage_type, is_active) VALUES ($1, 'Z9', '9', '9', '9', '9', 'RESERVE', true) RETURNING id;`,
        [branch.id]
      );
      locationId = newLoc.rows[0].id;
    } else {
      locationId = locationRes.rows[0].id;
    }

    // Find or create a warehouse LPN
    let lpnRes = await client.query(`SELECT id FROM public.warehouse_lpns WHERE branch_id = $1 LIMIT 1;`, [branch.id]);
    let lpnId;
    if (lpnRes.rows.length === 0) {
      const newLpn = await client.query(
        `INSERT INTO public.warehouse_lpns (lpn_code, branch_id, status, location_id) VALUES ('TEST-LPN-002', $1, 'active', $2) RETURNING id;`,
        [branch.id, locationId]
      );
      lpnId = newLpn.rows[0].id;
    } else {
      lpnId = lpnRes.rows[0].id;
    }

    // Get an organization details for the inventory movement (to satisfy REFERENCES)
    // First read an existing movement to clone its legal entity etc.
    let oldMovementRes = await client.query('SELECT company_id, legal_entity_id, org_unit_id, branch_name, warehouse_id, warehouse_name, currency_code FROM public.inventory_movements WHERE branch_id = $1 LIMIT 1;', [branch.id]);
    let oldM = oldMovementRes.rows[0] || {
      company_id: branch.id,
      legal_entity_id: null,
      org_unit_id: null,
      branch_name: branch.name,
      warehouse_id: null,
      warehouse_name: 'Ana Depo',
      currency_code: 'TRY'
    };

    console.log('Inserting quarantine movement...');
    const movementId = '99999999-9999-9999-9999-999999999999';
    await client.query(`
      INSERT INTO public.inventory_movements (
        id, company_id, legal_entity_id, org_unit_id, branch_id, branch_name,
        warehouse_id, warehouse_name, item_type, stock_item_id, item_name, item_sku,
        unit, unit_factor, movement_type, source_doc_type, direction, movement_at,
        quantity, unit_cost, total_cost, currency_code, location_id, lpn_id,
        lot_number, expiration_date, meta, calc_status
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, 'stock_item', $9, $10, $11,
        $12, 1.0, 'purchase_receipt', 'purchase_receipt', 'in', now(),
        100.0, 10.0, 1000.0, $13, $14, $15,
        'LOT-QUALITY-TEST-1', '2027-12-31', '{"availability_status": "quarantine"}', 'calculated'
      );
    `, [
      movementId, oldM.company_id, oldM.legal_entity_id, oldM.org_unit_id, branch.id, oldM.branch_name,
      oldM.warehouse_id, oldM.warehouse_name, item.id, item.name, item.sku, item.unit,
      oldM.currency_code, locationId, lpnId
    ]);

    // 2. Check quality hold record was created
    const holdRes = await client.query('SELECT * FROM public.warehouse_quality_holds WHERE movement_id = $1;', [movementId]);
    if (holdRes.rows.length === 1) {
      console.log('SUCCESS: Quality hold record automatically created by trigger.');
      const hold = holdRes.rows[0];
      console.log('Hold details:', {
        id: hold.id,
        status: hold.status,
        qty: hold.hold_qty,
        lot: hold.lot_number
      });

      // 3. Check v_wms_pickable_stock excludes quarantine
      const pickableRes = await client.query(`
        SELECT pickable_qty FROM public.v_wms_pickable_stock 
        WHERE branch_id = $1 AND stock_item_id = $2 AND lot_number = 'LOT-QUALITY-TEST-1';
      `, [branch.id, item.id]);
      
      const pickableQty = pickableRes.rows[0]?.pickable_qty || 0;
      console.log(`Pickable qty for test lot: ${pickableQty} (Expected: 0)`);
      if (Number(pickableQty) === 0) {
        console.log('SUCCESS: Quarantine stock is NOT pickable.');
      } else {
        throw new Error(`FAIL: Quarantine stock should not be pickable, but got ${pickableQty}`);
      }

      // 4. Resolve the quality hold (Release)
      console.log('Resolving quality hold (Release)...');
      const resolveRes = await client.query('SELECT public.resolve_warehouse_quality_hold($1, $2, $3, $4);', [
        hold.id, 'release', 'Kalite onaylandı, kullanıma hazır.', null
      ]);
      const result = resolveRes.rows[0].resolve_warehouse_quality_hold;
      console.log('Resolve RPC result:', result);

      if (result.success && result.status === 'released') {
        console.log('SUCCESS: Quality hold successfully released.');
      } else {
        throw new Error('FAIL: Failed to release quality hold.');
      }

      // 5. Check updated hold status
      const updatedHoldRes = await client.query('SELECT status FROM public.warehouse_quality_holds WHERE id = $1;', [hold.id]);
      console.log(`Updated Hold Status: ${updatedHoldRes.rows[0].status} (Expected: released)`);

      // 6. Check v_wms_pickable_stock again - should now be pickable
      const pickableResAfter = await client.query(`
        SELECT pickable_qty FROM public.v_wms_pickable_stock 
        WHERE branch_id = $1 AND stock_item_id = $2 AND lot_number = 'LOT-QUALITY-TEST-1';
      `, [branch.id, item.id]);
      
      const pickableQtyAfter = pickableResAfter.rows[0]?.pickable_qty || 0;
      console.log(`Pickable qty after release: ${pickableQtyAfter} (Expected: 100.0)`);
      if (Number(pickableQtyAfter) === 100.0) {
        console.log('SUCCESS: Released stock is now pickable!');
      } else {
        throw new Error(`FAIL: Released stock should be pickable (100.0), but got ${pickableQtyAfter}`);
      }

    } else {
      throw new Error(`FAIL: Quality hold record was not created (rows found: ${holdRes.rows.length})`);
    }

    console.log('Rollbacking transactions...');
    await client.query('ROLLBACK;');
    console.log('Rollback successful. Database clean.');

  } catch (err) {
    console.error('Test failed with error:', err);
    await client.query('ROLLBACK;');
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
