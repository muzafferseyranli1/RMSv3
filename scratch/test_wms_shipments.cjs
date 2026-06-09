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

    // 1. Pick two branches: one to act as warehouse (anadepo), one to act as branch (sube)
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

    // 3. Setup a dummy Warehouse Location and LPN
    const locInsert = await client.query(
      `INSERT INTO public.warehouse_locations (branch_id, zone_code, aisle, rack, level, bin, usage_type, is_active)
       VALUES ($1, 'Z', '05', '12', '4', 'A', 'RESERVE', true)
       RETURNING id;`,
      [warehouseNode.id]
    );
    const locationId = locInsert.rows[0].id;
    console.log(`Created warehouse location ID: ${locationId} (Z-0512-4A)`);

    const lpnCode = 'LPN-TEST-P6-' + Date.now();
    const lpnInsert = await client.query(
      `INSERT INTO public.warehouse_lpns (branch_id, lpn_code, status)
       VALUES ($1, $2, 'active')
       RETURNING id;`,
      [warehouseNode.id, lpnCode]
    );
    const lpnId = lpnInsert.rows[0].id;
    console.log(`Created LPN ID: ${lpnId} (${lpnCode})`);

    // 4. Setup initial available stock in this Location and LPN
    const initialQty = 100.0;
    const testLot = 'LOT-TEST-666';
    const testSkt = '2027-12-31';
    const stockIn = await client.query(
      `INSERT INTO public.inventory_movements (
         item_type, stock_item_id, item_name, branch_id, branch_name, 
         movement_type, source_doc_type, direction, movement_at, quantity, 
         unit_cost, total_cost, location_id, lpn_id, lot_number, expiration_date, meta
       ) VALUES (
         'stock_item', $1, $2, $3, $4, 
         'manual_adjustment_in', 'manual_adjustment', 'in', now(), $5, 
         10.0, 1000.0, $6, $7, $8, $9::date, '{"availability_status": "available"}'::jsonb
       ) RETURNING id;`,
      [item.id, item.name, warehouseNode.id, warehouseNode.name, initialQty, locationId, lpnId, testLot, testSkt]
    );
    console.log(`Setup initial available stock movement ID: ${stockIn.rows[0].id}`);

    // 5. Setup synched internal warehouse supplier for the warehouse node
    const syncKey = `anadepo_test_p6_${warehouseNode.id}`;
    let supplierRes = await client.query(
      `INSERT INTO public.suppliers (name, supplier_kind, source_branch_id, is_system_generated, sync_key)
       VALUES ($1, 'internal_warehouse', $2, true, $3)
       ON CONFLICT (sync_key) DO UPDATE SET name = EXCLUDED.name, deleted_at = null
       RETURNING id, name;`,
      [`Test İç Depo P6 (${warehouseNode.name})`, warehouseNode.id, syncKey]
    );
    const supplier = supplierRes.rows[0];
    console.log(`Internal supplier configured: ${supplier.name} (ID: ${supplier.id})`);

    // 6. Create a replenishment purchase order (Requested: 15.0 units)
    const orderNo = 'PO-REPL-P6-' + Date.now();
    const orderInsert = await client.query(
      `INSERT INTO public.purchase_orders (order_no, branch_id, branch_name, supplier_id, supplier_name, flow_channel, status, total_qty, subtotal, total_amount, meta)
       VALUES ($1, $2, $3, $4, $5, 'warehouse_replenishment', 'submitted', 15.0, 150.0, 150.0, '{}'::jsonb)
       RETURNING id;`,
      [orderNo, requestingBranchNode.id, requestingBranchNode.name, supplier.id, supplier.name]
    );
    const orderId = orderInsert.rows[0].id;
    console.log(`Inserted replenishment purchase_order ID: ${orderId} (No: ${orderNo})`);

    // 7. Create a purchase order line
    const lineInsert = await client.query(
      `INSERT INTO public.purchase_order_lines (order_id, line_no, stock_item_id, item_name, item_sku, unit, ordered_qty, unit_price, line_total, meta)
       VALUES ($1, 1, $2, $3, $4, $5, 15.0, 10.0, 150.0, '{}'::jsonb)
       RETURNING id;`,
      [orderId, item.id, item.name, item.sku, item.unit || 'adet']
    );
    const lineId = lineInsert.rows[0].id;
    console.log(`Inserted line ID: ${lineId} (Ordered Qty: 15.0)`);

    // 8. Create a Vehicle
    const plate = '34 WMS 666';
    const vehicleInsert = await client.query(
      `INSERT INTO public.vehicles (plate_number, model, driver_name, driver_phone, active)
       VALUES ($1, 'Ford Transit WMS', 'Ahmet Depocu', '05555555555', true)
       ON CONFLICT (plate_number) DO UPDATE SET active = true, deleted_at = null
       RETURNING id;`,
      [plate]
    );
    const vehicleId = vehicleInsert.rows[0].id;
    console.log(`Configured vehicle plate: ${plate} (ID: ${vehicleId})`);

    // 9. Create a draft shipment party (Sevkiyat Partisi)
    const shipmentNo = 'SH-TEST-P6-' + Date.now();
    const shipmentInsert = await client.query(
      `INSERT INTO public.warehouse_shipments (shipment_no, source_branch_id, vehicle_id, plate_number, driver_info, status, notes, meta)
       VALUES ($1, $2, $3, $4, 'Ahmet Depocu (05555555555)', 'draft', 'WMS Faz 6 Test Sevkiyatı', '{}'::jsonb)
       RETURNING id;`,
      [shipmentNo, warehouseNode.id, vehicleId, plate]
    );
    const shipmentId = shipmentInsert.rows[0].id;
    console.log(`Created draft shipment ID: ${shipmentId} (No: ${shipmentNo})`);

    // 10. Link PO to Shipment
    await client.query(
      `INSERT INTO public.warehouse_shipment_orders (shipment_id, purchase_order_id)
       VALUES ($1, $2);`,
      [shipmentId, orderId]
    );
    console.log(`Linked order ${orderNo} to shipment ${shipmentNo}.`);

    // 11. Add shipment line with partial qty (Shipped Qty: 12.0) and include picks meta
    const shippedQty = 12.0;
    const picksJson = [
      {
        location_id: locationId,
        lpn_id: lpnId,
        lot_number: testLot,
        expiration_date: testSkt,
        qty: shippedQty
      }
    ];

    await client.query(
      `INSERT INTO public.warehouse_shipment_lines (shipment_id, purchase_order_line_id, stock_item_id, shipped_qty, unit_price, line_total, meta)
       VALUES ($1, $2, $3, $4, 10.0, 120.0, $5::jsonb);`,
      [shipmentId, lineId, item.id, shippedQty, JSON.stringify({ picks: picksJson })]
    );
    console.log(`Added shipment line for ${item.name} with quantity: ${shippedQty} and Picks metadata.`);

    // 12. Update PO line & PO totals to match shipped quantity (re-calculates order totals)
    const nextMeta = { original_ordered_qty: 15.0 };
    await client.query(
      `UPDATE public.purchase_order_lines
       SET ordered_qty = $1, line_total = $2, meta = $3, updated_at = now()
       WHERE id = $4;`,
      [shippedQty, shippedQty * 10.0, JSON.stringify(nextMeta), lineId]
    );
    await client.query(
      `UPDATE public.purchase_orders
       SET total_qty = $1, total_amount = $2, subtotal = $2, updated_at = now()
       WHERE id = $3;`,
      [shippedQty, shippedQty * 10.0, orderId]
    );
    console.log(`Updated PO line quantity to ${shippedQty} and recalculated order totals.`);

    // 13. Verify draft state in DB before calling the database RPC
    const verifyShipmentDraft = await client.query('SELECT status FROM public.warehouse_shipments WHERE id = $1;', [shipmentId]);
    console.log(`\n--- DRAFT SHIPMENT STATE ---`);
    console.log(`Shipment Status: ${verifyShipmentDraft.rows[0].status} (Expected: draft)`);

    // 13.5 Verify authorization guard (calling the RPC with a wrong p_branch_id should raise an exception)
    console.log('\nVerifying authorization guard (calling RPC with mismatching p_branch_id)...');
    let authCheckFailed = false;
    const wrongBranchId = '00000000-0000-0000-0000-000000000000'; // Mismatching UUID
    await client.query('SAVEPOINT auth_guard_savepoint;');
    try {
      await client.query(
        `SELECT public.confirm_warehouse_shipment($1, $2, $3);`,
        [shipmentId, wrongBranchId, warehouseNode.name]
      );
    } catch (err) {
      authCheckFailed = err.message.includes('Yetkisiz depo işlemi');
      console.log(`Expected error received: "${err.message}" (Authorization guard block SUCCESSFUL: ${authCheckFailed})`);
      await client.query('ROLLBACK TO auth_guard_savepoint;');
    }

    if (!authCheckFailed) {
      throw new Error('Authorization check failed. RPC executed with wrong branch ID.');
    }

    // 14. Execute the DB RPC atomically to confirm the shipment
    console.log('\nInvoking database RPC: public.confirm_warehouse_shipment...');
    await client.query(
      `SELECT public.confirm_warehouse_shipment($1, $2, $3);`,
      [shipmentId, warehouseNode.id, warehouseNode.name]
    );
    console.log('RPC execution completed successfully.');

    // 15. Verifications
    // 15.1 Verify shipment status updated to 'in_transit'
    const verifyShipmentTransit = await client.query('SELECT status, plate_number, driver_info FROM public.warehouse_shipments WHERE id = $1;', [shipmentId]);
    
    // 15.2 Verify inventory movements (make sure location_id, lpn_id, lot_number, and expiration_date are preserved)
    const verifyMovement = await client.query(
      `SELECT direction, movement_type, quantity, location_id, lpn_id, lot_number, expiration_date::text 
       FROM public.inventory_movements 
       WHERE branch_id = $1 AND stock_item_id = $2 AND direction = 'out' AND movement_type = 'transfer_out' 
       ORDER BY created_at DESC LIMIT 1;`,
      [warehouseNode.id, item.id]
    );
    
    // 15.3 Verify purchase order metadata updated
    const verifyOrderMeta = await client.query('SELECT meta FROM public.purchase_orders WHERE id = $1;', [orderId]);

    const shipmentData = verifyShipmentTransit.rows[0];
    const movementData = verifyMovement.rows[0];
    const orderMetaData = verifyOrderMeta.rows[0].meta;

    console.log(`\n--- VERIFICATION RESULTS ---`);
    console.log(`Shipment status in transit? ${shipmentData.status === 'in_transit' ? 'YES' : 'NO'} (${shipmentData.status})`);
    console.log(`Shipment plate: ${shipmentData.plate_number}`);
    
    if (movementData) {
      console.log(`Inventory movement direction: ${movementData.direction} (Expected: out)`);
      console.log(`Inventory movement type: ${movementData.movement_type} (Expected: transfer_out)`);
      console.log(`Inventory movement quantity: ${Number(movementData.quantity)} (Expected: 12)`);
      console.log(`Inventory movement location: ${movementData.location_id} (Expected: ${locationId})`);
      console.log(`Inventory movement LPN: ${movementData.lpn_id} (Expected: ${lpnId})`);
      console.log(`Inventory movement Lot Number: ${movementData.lot_number} (Expected: ${testLot})`);
      console.log(`Inventory movement Expiration Date: ${movementData.expiration_date} (Expected: ${testSkt})`);
    } else {
      console.log(`Inventory movement: NOT FOUND! (Failed to write exit movement)`);
    }
    
    console.log(`PO supplier_marked_sent: ${orderMetaData.supplier_marked_sent} (Expected: true)`);
    console.log(`PO doc_no matches shipment_no: ${orderMetaData.supplier_dispatch?.doc_no === shipmentNo ? 'YES' : 'NO'}`);

    // 16. Verify double confirmation idempotency (calling the RPC again should raise an exception)
    console.log('\nVerifying idempotency guard (calling RPC a second time)...');
    let doubleConfirmFailed = false;
    try {
      await client.query(
        `SELECT public.confirm_warehouse_shipment($1, $2, $3);`,
        [shipmentId, warehouseNode.id, warehouseNode.name]
      );
    } catch (err) {
      doubleConfirmFailed = true;
      console.log(`Expected error received: "${err.message}" (Idempotency guard block SUCCESSFUL)`);
    }

    if (!doubleConfirmFailed) {
      throw new Error('Double confirmation succeeded. Idempotency guard FAILED.');
    }

    // Final checks
    const hasCorrectMovement = movementData &&
      movementData.direction === 'out' &&
      movementData.movement_type === 'transfer_out' &&
      Number(movementData.quantity) === shippedQty &&
      movementData.location_id === locationId &&
      movementData.lpn_id === lpnId &&
      movementData.lot_number === testLot &&
      movementData.expiration_date === testSkt;

    if (
      shipmentData.status === 'in_transit' &&
      shipmentData.plate_number === plate &&
      hasCorrectMovement &&
      orderMetaData.supplier_marked_sent === true &&
      orderMetaData.supplier_dispatch?.doc_no === shipmentNo &&
      doubleConfirmFailed &&
      authCheckFailed
    ) {
      console.log('\n✅ WMS Phase 6 Integration Test SUCCESSFUL!');
    } else {
      console.log('\n❌ WMS Phase 6 Integration Test FAILED!');
      process.exitCode = 1;
    }

  } catch (err) {
    console.error('Error during WMS Phase 6 verification:', err);
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
