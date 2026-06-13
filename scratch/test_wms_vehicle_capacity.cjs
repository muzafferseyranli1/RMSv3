require('dotenv').config({ path: 'server/.env' });
const { Client } = require('pg');

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

    // 1. Pick branch nodes
    const warehouseNodeRes = await client.query("SELECT id, name FROM public.company_nodes WHERE type = 'anadepo' LIMIT 1;");
    const requestingBranchNodeRes = await client.query("SELECT id, name FROM public.company_nodes WHERE type = 'sube' LIMIT 1;");

    if (warehouseNodeRes.rows.length === 0 || requestingBranchNodeRes.rows.length === 0) {
      console.log('Skipping test: Missing required company nodes of type "anadepo" or "sube".');
      await client.query('ROLLBACK;');
      await client.end();
      return;
    }

    const warehouseNode = warehouseNodeRes.rows[0];
    const requestingBranchNode = requestingBranchNodeRes.rows[0];

    console.log(`Warehouse node: ${warehouseNode.name} (ID: ${warehouseNode.id})`);
    console.log(`Requesting branch node: ${requestingBranchNode.name} (ID: ${requestingBranchNode.id})`);

    // 2. Select a stock item
    const itemRes = await client.query('SELECT id, name, sku, unit FROM public.stock_items WHERE deleted_at IS NULL LIMIT 1;');
    if (itemRes.rows.length === 0) {
      console.log('No stock items found to run test. Skipping.');
      await client.query('ROLLBACK;');
      await client.end();
      return;
    }
    const item = itemRes.rows[0];
    console.log(`Stock Item for test: ${item.name} (ID: ${item.id})`);

    // 2.5 Ensure stock_item temperature_class is set to 'frozen' for testing temp mismatch
    await client.query("UPDATE public.stock_items SET temperature_class = 'frozen' WHERE id = $1;", [item.id]);
    console.log(`Updated stock item temperature class to 'frozen'.`);

    // 3. Setup a dummy Warehouse Location and LPN
    const locInsert = await client.query(
      `INSERT INTO public.warehouse_locations (branch_id, zone_code, aisle, rack, level, bin, usage_type, is_active)
       VALUES ($1, 'Z', '99', '99', '9', 'A', 'RESERVE', true)
       RETURNING id;`,
      [warehouseNode.id]
    );
    const locationId = locInsert.rows[0].id;

    const lpnCode = 'LPN-TEST-CAP-' + Date.now();
    const lpnInsert = await client.query(
      `INSERT INTO public.warehouse_lpns (branch_id, lpn_code, status)
       VALUES ($1, $2, 'active')
       RETURNING id;`,
      [warehouseNode.id, lpnCode]
    );
    const lpnId = lpnInsert.rows[0].id;

    // 4. Setup initial available stock
    const initialQty = 1000.0;
    const testLot = 'LOT-TEST-CAP';
    const testSkt = '2028-12-31';
    await client.query(
      `INSERT INTO public.inventory_movements (
         item_type, stock_item_id, item_name, branch_id, branch_name, 
         movement_type, source_doc_type, direction, movement_at, quantity, 
         unit_cost, total_cost, location_id, lpn_id, lot_number, expiration_date, meta
       ) VALUES (
         'stock_item', $1, $2, $3, $4, 
         'manual_adjustment_in', 'manual_adjustment', 'in', now(), $5, 
         10.0, 10000.0, $6, $7, $8, $9::date, '{"availability_status": "available"}'::jsonb
       );`,
      [item.id, item.name, warehouseNode.id, warehouseNode.name, initialQty, locationId, lpnId, testLot, testSkt]
    );
    console.log(`Initial stock configured: ${initialQty} units.`);

    // 5. Check if a supplier for this branch already exists, if not create one
    let supplierRes = await client.query(
      `SELECT id, name FROM public.suppliers 
       WHERE source_branch_id = $1 AND supplier_kind = 'internal_warehouse' AND deleted_at IS NULL 
       LIMIT 1;`,
      [warehouseNode.id]
    );
    
    let supplier;
    if (supplierRes.rows.length > 0) {
      supplier = supplierRes.rows[0];
      console.log(`Using existing internal supplier: ${supplier.name} (ID: ${supplier.id})`);
    } else {
      const syncKey = `anadepo_test_cap_${warehouseNode.id}`;
      supplierRes = await client.query(
        `INSERT INTO public.suppliers (name, supplier_kind, source_branch_id, is_system_generated, sync_key)
         VALUES ($1, 'internal_warehouse', $2, true, $3)
         ON CONFLICT (sync_key) DO UPDATE SET name = EXCLUDED.name, deleted_at = null
         RETURNING id, name;`,
        [`Test İç Depo Cap (${warehouseNode.name})`, warehouseNode.id, syncKey]
      );
      supplier = supplierRes.rows[0];
      console.log(`Created new internal supplier: ${supplier.name} (ID: ${supplier.id})`);
    }

    // 6. Create a replenishment purchase order
    const orderNo = 'PO-REPL-CAP-' + Date.now();
    const orderInsert = await client.query(
      `INSERT INTO public.purchase_orders (order_no, branch_id, branch_name, supplier_id, supplier_name, flow_channel, status, total_qty, subtotal, total_amount, meta)
       VALUES ($1, $2, $3, $4, $5, 'warehouse_replenishment', 'submitted', 10.0, 100.0, 100.0, '{}'::jsonb)
       RETURNING id;`,
      [orderNo, requestingBranchNode.id, requestingBranchNode.name, supplier.id, supplier.name]
    );
    const orderId = orderInsert.rows[0].id;

    // 7. Create PO line
    const lineInsert = await client.query(
      `INSERT INTO public.purchase_order_lines (order_id, line_no, stock_item_id, item_name, item_sku, unit, ordered_qty, unit_price, line_total, meta)
       VALUES ($1, 1, $2, $3, $4, $5, 10.0, 10.0, 100.0, '{}'::jsonb)
       RETURNING id;`,
      [orderId, item.id, item.name, item.sku, item.unit || 'adet']
    );
    const lineId = lineInsert.rows[0].id;

    // 8. Create a Vehicle with cold storage (frozen items are mismatching)
    const plate = '34 WMS CAP';
    const vehicleInsert = await client.query(
      `INSERT INTO public.vehicles (
         plate_number, vehicle_code, display_name, model, vehicle_type, 
         temperature_class, max_volume_m3, max_weight_kg, 
         inner_length_cm, inner_width_cm, inner_height_cm, active
       ) VALUES ($1, $2, $3, $4, 'truck', 'cold', 2.0, 200.0, 200, 100, 100, true)
       ON CONFLICT (plate_number) DO UPDATE SET active = true, deleted_at = null
       RETURNING id;`,
      [plate, 'V-CODE-CAP', 'Cap Test Truck', 'Transit Cold']
    );
    const vehicleId = vehicleInsert.rows[0].id;
    console.log(`Configured vehicle plate: ${plate} (ID: ${vehicleId}, Temp Class: cold, Max Vol: 2.0 m3, Max Weight: 200 kg)`);

    // 8.5 Setup package unit with dimensions to test capacity trigger
    await client.query("DELETE FROM public.stock_item_package_units WHERE stock_item_id = $1;", [item.id]);
    const pkgInsert = await client.query(
      `INSERT INTO public.stock_item_package_units (
         stock_item_id, unit_name, base_quantity, length_cm, width_cm, height_cm, 
         gross_weight_kg, net_weight_kg, is_base_unit, is_default_shipping_unit, active
       ) VALUES ($1, 'Koli', 1.0, 50.0, 50.0, 40.0, 25.0, 20.0, true, true, true)
       RETURNING id, volume_m3;`,
      [item.id]
    );
    const pkgId = pkgInsert.rows[0].id;
    const pkgVol = Number(pkgInsert.rows[0].volume_m3);
    console.log(`Configured package unit (ID: ${pkgId}, Volume: ${pkgVol} m3, Gross Weight: 25 kg)`);

    // 9. Create draft shipment via RPC to populate dimensions & weight
    const draftDetails = {};
    draftDetails[item.id] = 5.0; // 5 Kolisi = 5 * 0.1 = 0.5 m3, 5 * 25 = 125 kg
    const shipmentId = await client.query(
      `SELECT public.create_warehouse_shipment_with_reservations($1, $2, $3, $4, $5, $6, $7) AS id;`,
      [warehouseNode.id, [orderId], JSON.stringify(draftDetails), plate, 'Driver Test', 'Notes test', vehicleId]
    ).then(res => res.rows[0].id);
    console.log(`Created shipment ID: ${shipmentId}`);

    // Verify shipment capacity calculations
    const capCheckRes = await client.query('SELECT public.get_warehouse_shipment_capacity($1) AS cap;', [shipmentId]);
    const capInfo = capCheckRes.rows[0].cap;
    console.log(`Shipment volume: ${capInfo.total_volume_m3} m3, gross weight: ${capInfo.total_weight_kg} kg`);
    console.log(`Is temperature mismatched? ${capInfo.is_temperature_mismatched}`);

    // Complete any warehouse tasks generated automatically for this shipment to bypass the tasks guard
    await client.query(
      `UPDATE public.warehouse_tasks 
       SET status = 'done', completed_at = now() 
       WHERE source_doc_type = 'warehouse_shipment' AND source_doc_id = $1;`,
      [shipmentId]
    );
    console.log('Automatically generated warehouse tasks marked as done.');

    // 10. Attempt confirm: Expect Temperature Mismatch Exception
    console.log('\nTesting Temperature Compliance Guard...');
    let tempMismatchCaught = false;
    await client.query('SAVEPOINT temp_guard;');
    try {
      await client.query('SELECT public.confirm_warehouse_shipment($1, $2, $3);', [shipmentId, warehouseNode.id, warehouseNode.name]);
    } catch (err) {
      tempMismatchCaught = err.message.includes('Araç sıcaklık sınıfı ile sevk edilecek ürünlerin sıcaklık gereksinimleri uyuşmuyor');
      console.log(`Expected error received: "${err.message}" (Temp guard SUCCESS: ${tempMismatchCaught})`);
      await client.query('ROLLBACK TO SAVEPOINT temp_guard;');
    }

    if (!tempMismatchCaught) {
      throw new Error('Temperature Compliance Guard failed to raise an exception.');
    }

    // Fix temperature class of vehicle to 'frozen' to resolve temp mismatch
    await client.query("UPDATE public.vehicles SET temperature_class = 'frozen' WHERE id = $1;", [vehicleId]);
    console.log(`Updated vehicle temperature class to 'frozen' to pass temp check.`);

    // 11. Now increase shipment quantity to exceed volume/weight capacity limits
    console.log('\nTesting Capacity Limit Guard...');
    // We update the shipment line to have a larger quantity
    // Let's set quantity to 20.0 (20 * 0.1 = 2.0 m3, 20 * 25 = 500 kg -> exceeds max weight 200 kg)
    const largeQty = 20.0;
    
    // We need to re-reserve or just update the shipment line for weight test simplicity
    await client.query(
      `UPDATE public.warehouse_shipment_lines 
       SET shipped_qty = $1, 
           package_qty = $1,
           base_qty = $1,
           line_volume_m3 = $1 * 0.1,
           line_gross_weight_kg = $1 * 25.0
       WHERE shipment_id = $2;`,
      [largeQty, shipmentId]
    );
    console.log(`Updated shipment line quantity to ${largeQty} to exceed vehicle weight capacity.`);

    // Attempt confirm: Expect Capacity Exceeded Exception
    let capacityExceededCaught = false;
    await client.query('SAVEPOINT cap_guard;');
    try {
      await client.query('SELECT public.confirm_warehouse_shipment($1, $2, $3);', [shipmentId, warehouseNode.id, warehouseNode.name]);
    } catch (err) {
      capacityExceededCaught = err.message.includes('Araç taşıma kapasitesi (hacim veya ağırlık) aşılmıştır');
      console.log(`Expected error received: "${err.message}" (Capacity guard SUCCESS: ${capacityExceededCaught})`);
      await client.query('ROLLBACK TO SAVEPOINT cap_guard;');
    }

    if (!capacityExceededCaught) {
      throw new Error('Capacity Limit Guard failed to raise an exception.');
    }

    // 12. Test Manager Override Bypass
    console.log('\nTesting Manager Override Bypass...');
    await client.query(
      `UPDATE public.warehouse_shipments 
       SET meta = jsonb_set(meta, '{capacity_override}', '"true"')
       WHERE id = $1;`,
      [shipmentId]
    );
    console.log(`Set capacity_override = true in shipment meta.`);

    // Attempt confirm again: Should pass without exceptions
    let overridePassed = false;
    try {
      await client.query('SELECT public.confirm_warehouse_shipment($1, $2, $3);', [shipmentId, warehouseNode.id, warehouseNode.name]);
      overridePassed = true;
      console.log('RPC execution completed successfully using Manager Override Bypass.');
    } catch (err) {
      console.error('Override failed:', err.message);
    }

    if (!overridePassed) {
      throw new Error('Manager Override Bypass failed to allow shipment confirmation.');
    }

    // Verify shipment status updated to 'in_transit'
    const finalShipmentState = await client.query('SELECT status FROM public.warehouse_shipments WHERE id = $1;', [shipmentId]);
    console.log(`Final shipment status: ${finalShipmentState.rows[0].status} (Expected: in_transit)`);

    if (tempMismatchCaught && capacityExceededCaught && overridePassed && finalShipmentState.rows[0].status === 'in_transit') {
      console.log('\n✅ WMS Vehicle Capacity Control Integration Test SUCCESSFUL!');
    } else {
      console.log('\n❌ WMS Vehicle Capacity Control Integration Test FAILED!');
      process.exitCode = 1;
    }

  } catch (err) {
    console.error('Error during capacity validation:', err);
    process.exitCode = 1;
  } finally {
    try {
      await client.query('ROLLBACK;');
      console.log('Transaction rolled back successfully. Database remains clean.');
    } catch (rollbackErr) {
      console.error('Failed to rollback transaction:', rollbackErr.message);
    }
    await client.end();
  }
}

main();
