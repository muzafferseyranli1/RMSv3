import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is missing. Please define it in environment variables.");
  process.exit(1);
}

async function runTest() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to DB successfully.");

    // Start transaction
    await client.query("BEGIN;");
    console.log("Started transaction.");

    // Pick warehouse (anadepo) and branch (sube) nodes
    const warehouseNodeRes = await client.query("SELECT id, name FROM public.company_nodes WHERE type = 'anadepo' LIMIT 1;");
    const requestingBranchNodeRes = await client.query("SELECT id, name FROM public.company_nodes WHERE type = 'sube' LIMIT 1;");

    if (warehouseNodeRes.rows.length === 0 || requestingBranchNodeRes.rows.length === 0) {
      console.log("Skipping test: Missing required company nodes.");
      await client.query("ROLLBACK;");
      await client.end();
      return;
    }

    const warehouseNode = warehouseNodeRes.rows[0];
    const requestingBranchNode = requestingBranchNodeRes.rows[0];

    // Select a stock item
    const itemRes = await client.query("SELECT id, name, sku, unit FROM public.stock_items WHERE deleted_at IS NULL LIMIT 1;");
    if (itemRes.rows.length === 0) {
      console.log("No stock items found. Skipping.");
      await client.query("ROLLBACK;");
      await client.end();
      return;
    }
    const item = itemRes.rows[0];

    // Setup internal warehouse supplier
    let supplierId;
    const supplierRes = await client.query(
      "SELECT id FROM public.suppliers WHERE source_branch_id = $1 AND supplier_kind = 'internal_warehouse' AND deleted_at IS NULL LIMIT 1;",
      [warehouseNode.id]
    );

    if (supplierRes.rows.length === 0) {
      const supInsert = await client.query(
        `INSERT INTO public.suppliers (name, supplier_kind, source_branch_id, active, is_system_generated)
         VALUES ($1, 'internal_warehouse', $2, true, true)
         RETURNING id;`,
        [`Internal Supplier for ${warehouseNode.name}`, warehouseNode.id]
      );
      supplierId = supInsert.rows[0].id;
    } else {
      supplierId = supplierRes.rows[0].id;
    }

    // Setup warehouse location
    const locInsert = await client.query(
      `INSERT INTO public.warehouse_locations (branch_id, zone_code, aisle, rack, level, bin, usage_type, is_active)
       VALUES ($1, 'Z', '88', '88', '1', 'A', 'RESERVE', true)
       RETURNING id;`,
      [warehouseNode.id]
    );
    const locationId = locInsert.rows[0].id;

    // Seed stock movements (e.g. 200 units)
    await client.query(
      `INSERT INTO public.inventory_movements (
         item_type, stock_item_id, item_name, branch_id, branch_name, movement_type,
         source_doc_type, direction, movement_at, quantity, unit_cost, total_cost,
         location_id, meta
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10, $11, $12, $13);`,
      [
        'stock_item', item.id, item.name, warehouseNode.id, warehouseNode.name, 'opening_balance',
        'opening_balance', 'in', 200.0, 10.0, 2000.0, locationId,
        JSON.stringify({ availability_status: 'available' })
      ]
    );

    // --- CASE 1, 2, 3 & 4: Confirmation Validation Tests ---

    // Create a Purchase Order 1
    const po1Insert = await client.query(
      `INSERT INTO public.purchase_orders (
         order_no, branch_id, branch_name, supplier_id, supplier_name, status,
         total_qty, subtotal, total_amount, flow_channel
       ) VALUES ($1, $2, $3, $4, $5, 'pending_action', 0, 0, 0, 'warehouse_replenishment')
       RETURNING id;`,
      [
        'PO-WMS-TEST-CONF-1-' + Date.now(), requestingBranchNode.id, requestingBranchNode.name,
        supplierId, `Internal Supplier for ${warehouseNode.name}`
      ]
    );
    const po1Id = po1Insert.rows[0].id;

    const po1LineInsert = await client.query(
      `INSERT INTO public.purchase_order_lines (
         order_id, stock_item_id, item_name, item_sku, unit, ordered_qty, unit_price, line_total
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id;`,
      [po1Id, item.id, item.name, item.sku, item.unit || 'Adet', 15.0, 10.0, 150.0]
    );

    await client.query(
      "UPDATE public.purchase_orders SET total_qty = 15, subtotal = 150, total_amount = 150 WHERE id = $1;",
      [po1Id]
    );

    // Create shipment draft for 10 units
    const shipmentDraft = { [item.id]: 10.0 };
    const rpcRes = await client.query(
      "SELECT public.create_warehouse_shipment_with_reservations($1, $2, $3, $4, $5, $6, $7) AS shipment_id;",
      [
        warehouseNode.id,
        [po1Id],
        JSON.stringify(shipmentDraft),
        '34TEST99',
        'Test Driver',
        'Test notes',
        null
      ]
    );
    const shipmentId = rpcRes.rows[0].shipment_id;

    // Get the created reservation ID
    const resRes = await client.query(
      "SELECT id, reserved_qty, status FROM public.warehouse_reservations WHERE source_doc_id = $1;",
      [shipmentId]
    );
    const reservationId = resRes.rows[0].id;

    // Set all created pick tasks to 'done' so they don't block confirm_warehouse_shipment guard in this legacy test
    await client.query("UPDATE public.warehouse_tasks SET status = 'done' WHERE source_doc_id = $1;", [shipmentId]);

    // Fetch shipment line details
    const lineRes = await client.query(
      "SELECT id, meta FROM public.warehouse_shipment_lines WHERE shipment_id = $1;",
      [shipmentId]
    );
    const shipmentLineId = lineRes.rows[0].id;
    const originalMeta = lineRes.rows[0].meta;

    // Test Case 1: Reservation ID is missing / invalid
    console.log("Test Case 1: Confirm with invalid reservation ID...");
    await client.query("SAVEPOINT confirm_val_1;");
    try {
      const badPicks = JSON.parse(JSON.stringify(originalMeta.picks));
      badPicks[0].reservation_id = '00000000-0000-0000-0000-000000000000'; // bad UUID
      
      await client.query(
        "UPDATE public.warehouse_shipment_lines SET meta = $1 WHERE id = $2;",
        [JSON.stringify({ picks: badPicks }), shipmentLineId]
      );

      await client.query(
        "SELECT public.confirm_warehouse_shipment($1, $2, $3);",
        [shipmentId, warehouseNode.id, warehouseNode.name]
      );
      throw new Error("Case 1 failed: Should have thrown reservation not found error!");
    } catch (err) {
      if (err.message.includes("İlgili rezervasyon bulunamadı")) {
        console.log("  ✅ Expected Exception Caught: " + err.message);
        await client.query("ROLLBACK TO SAVEPOINT confirm_val_1;");
      } else {
        throw err;
      }
    }

    // Test Case 2: Quantity mismatch (change sevk qty in picks to 9.0 while reservation is 10.0)
    console.log("Test Case 2: Confirm with quantity mismatch...");
    await client.query("SAVEPOINT confirm_val_2;");
    try {
      const badPicks = JSON.parse(JSON.stringify(originalMeta.picks));
      badPicks[0].qty = 9.0;
      
      await client.query(
        "UPDATE public.warehouse_shipment_lines SET meta = $1 WHERE id = $2;",
        [JSON.stringify({ picks: badPicks }), shipmentLineId]
      );

      await client.query(
        "SELECT public.confirm_warehouse_shipment($1, $2, $3);",
        [shipmentId, warehouseNode.id, warehouseNode.name]
      );
      throw new Error("Case 2 failed: Should have thrown quantity mismatch error!");
    } catch (err) {
      if (err.message.includes("Rezervasyon miktarı ile sevk miktarı uyuşmuyor")) {
        console.log("  ✅ Expected Exception Caught: " + err.message);
        await client.query("ROLLBACK TO SAVEPOINT confirm_val_2;");
      } else {
        throw err;
      }
    }

    // Test Case 3: Reservation is not active (cancel reservation manually first)
    console.log("Test Case 3: Confirm with non-active reservation...");
    await client.query("SAVEPOINT confirm_val_3;");
    try {
      await client.query(
        "UPDATE public.warehouse_reservations SET status = 'cancelled' WHERE id = $1;",
        [reservationId]
      );

      await client.query(
        "SELECT public.confirm_warehouse_shipment($1, $2, $3);",
        [shipmentId, warehouseNode.id, warehouseNode.name]
      );
      throw new Error("Case 3 failed: Should have thrown reservation not active error!");
    } catch (err) {
      if (err.message.includes("Rezervasyon aktif değil")) {
        console.log("  ✅ Expected Exception Caught: " + err.message);
        await client.query("ROLLBACK TO SAVEPOINT confirm_val_3;");
      } else {
        throw err;
      }
    }

    // Test Case 4: Successful Confirmation (Consumes reservation)
    console.log("Test Case 4: Confirming successfully...");
    await client.query(
      "SELECT public.confirm_warehouse_shipment($1, $2, $3);",
      [shipmentId, warehouseNode.id, warehouseNode.name]
    );

    // Verify reservation consumed
    const resAfterRes = await client.query(
      "SELECT status, consumed_at FROM public.warehouse_reservations WHERE id = $1;",
      [reservationId]
    );
    const resRow = resAfterRes.rows[0];
    console.log(`  Reservation Status: ${resRow.status}, Consumed At: ${resRow.consumed_at}`);
    if (resRow.status !== 'consumed') throw new Error("Reservation must be consumed!");
    if (!resRow.consumed_at) throw new Error("consumed_at must be populated!");

    // Verify transfer_out movement created
    const movementRes = await client.query(
      "SELECT movement_type, quantity, location_id FROM public.inventory_movements WHERE meta->>'shipment_id' = $1 AND direction = 'out';",
      [shipmentId]
    );
    if (movementRes.rows.length === 0) throw new Error("Stock exit movement was not created!");
    const mov = movementRes.rows[0];
    console.log(`  Stock exit movement: ${mov.movement_type}, qty: ${mov.quantity}, location: ${mov.location_id}`);
    if (Number(mov.quantity) !== 10.0) throw new Error("Movement quantity must match reservation!");
    if (mov.location_id !== locationId) throw new Error("Movement location must match reservation location!");


    // --- CASE 5: Cancel / Release RPC Tests ---

    // Create PO 2
    console.log("Test Case 5: Testing cancel_warehouse_shipment RPC...");
    const po2Insert = await client.query(
      `INSERT INTO public.purchase_orders (
         order_no, branch_id, branch_name, supplier_id, supplier_name, status,
         total_qty, subtotal, total_amount, flow_channel
       ) VALUES ($1, $2, $3, $4, $5, 'pending_action', 0, 0, 0, 'warehouse_replenishment')
       RETURNING id;`,
      [
        'PO-WMS-TEST-CONF-2-' + Date.now(), requestingBranchNode.id, requestingBranchNode.name,
        supplierId, `Internal Supplier for ${warehouseNode.name}`
      ]
    );
    const po2Id = po2Insert.rows[0].id;

    const po2LineInsert = await client.query(
      `INSERT INTO public.purchase_order_lines (
         order_id, stock_item_id, item_name, item_sku, unit, ordered_qty, unit_price, line_total
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id;`,
      [po2Id, item.id, item.name, item.sku, item.unit || 'Adet', 20.0, 10.0, 200.0]
    );
    const po2LineId = po2LineInsert.rows[0].id;

    await client.query(
      "UPDATE public.purchase_orders SET total_qty = 20, subtotal = 200, total_amount = 200 WHERE id = $1;",
      [po2Id]
    );

    // Create shipment draft for 12 units
    const shipmentDraft2 = { [item.id]: 12.0 };
    const rpcRes2 = await client.query(
      "SELECT public.create_warehouse_shipment_with_reservations($1, $2, $3, $4, $5, $6, $7) AS shipment_id;",
      [
        warehouseNode.id,
        [po2Id],
        JSON.stringify(shipmentDraft2),
        '34TEST99',
        'Test Driver',
        'Test notes',
        null
      ]
    );
    const shipment2Id = rpcRes2.rows[0].shipment_id;

    // Verify PO 2 line ordered_qty is updated to 12
    const po2LinePreCancel = await client.query("SELECT ordered_qty FROM public.purchase_order_lines WHERE id = $1;", [po2LineId]);
    console.log(`  PO2 Line ordered_qty before cancel: ${po2LinePreCancel.rows[0].ordered_qty}`);
    if (Number(po2LinePreCancel.rows[0].ordered_qty) !== 12.0) throw new Error("PO2 Line ordered_qty must be updated to shipped quantity 12.0!");

    // Call cancel_warehouse_shipment
    await client.query("SELECT public.cancel_warehouse_shipment($1, $2);", [shipment2Id, warehouseNode.id]);
    console.log("  Executed cancel_warehouse_shipment RPC.");

    // Verify shipment status is cancelled
    const shStatusCheck = await client.query("SELECT status FROM public.warehouse_shipments WHERE id = $1;", [shipment2Id]);
    console.log(`  Shipment Status: ${shStatusCheck.rows[0].status}`);
    if (shStatusCheck.rows[0].status !== 'cancelled') throw new Error("Shipment status must be cancelled!");

    // Verify reservation status is cancelled and released_at populated
    const resStatusCheck = await client.query(
      "SELECT status, released_at FROM public.warehouse_reservations WHERE source_doc_id = $1;",
      [shipment2Id]
    );
    console.log(`  Reservation count: ${resStatusCheck.rows.length}`);
    resStatusCheck.rows.forEach(r => {
      console.log(`    Reservation Status: ${r.status}, Released At: ${r.released_at}`);
      if (r.status !== 'cancelled') throw new Error("Reservation status must be cancelled!");
      if (!r.released_at) throw new Error("released_at must be populated!");
    });

    // Verify PO Line ordered_qty is restored back to 20.0
    const po2LinePostCancel = await client.query("SELECT ordered_qty, meta FROM public.purchase_order_lines WHERE id = $1;", [po2LineId]);
    console.log(`  PO2 Line ordered_qty after cancel: ${po2LinePostCancel.rows[0].ordered_qty}`);
    if (Number(po2LinePostCancel.rows[0].ordered_qty) !== 20.0) throw new Error("PO2 Line ordered_qty must be restored back to 20.0!");
    if (po2LinePostCancel.rows[0].meta.original_ordered_qty !== undefined) throw new Error("original_ordered_qty must be deleted from meta!");

    // Verify PO totals recalculated
    const po2HeaderPostCancel = await client.query("SELECT total_qty, total_amount FROM public.purchase_orders WHERE id = $1;", [po2Id]);
    console.log(`  PO2 Header total_qty: ${po2HeaderPostCancel.rows[0].total_qty}, total_amount: ${po2HeaderPostCancel.rows[0].total_amount}`);
    if (Number(po2HeaderPostCancel.rows[0].total_qty) !== 20.0) throw new Error("PO2 Header total_qty must be restored to 20.0!");
    if (Number(po2HeaderPostCancel.rows[0].total_amount) !== 200.0) throw new Error("PO2 Header total_amount must be restored to 200.0!");

    console.log("✅ [ALL TESTS PASSED] confirm_warehouse_shipment and cancel_warehouse_shipment transaction tests passed successfully!");

    // Rollback outer transaction to leave DB clean
    await client.query("ROLLBACK;");
    console.log("Outer transaction rolled back.");
  } catch (err) {
    console.error("❌ Test Failed:", err);
    try {
      await client.query("ROLLBACK;");
    } catch (e) {}
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTest();
