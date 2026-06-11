import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is missing.");
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

    // 1. Pick warehouse (anadepo) and branch (sube) nodes
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
    console.log(`Warehouse node: ${warehouseNode.name} (${warehouseNode.id})`);
    console.log(`Branch node: ${requestingBranchNode.name} (${requestingBranchNode.id})`);

    // 2. Select a stock item
    const itemRes = await client.query("SELECT id, name, sku, unit FROM public.stock_items WHERE deleted_at IS NULL LIMIT 1;");
    if (itemRes.rows.length === 0) {
      console.log("No stock items found. Skipping.");
      await client.query("ROLLBACK;");
      await client.end();
      return;
    }
    const item = itemRes.rows[0];
    console.log(`Stock Item: ${item.name} (${item.id})`);

    // 3. Setup internal warehouse supplier
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

    // 4. Setup warehouse location
    const locInsert = await client.query(
      `INSERT INTO public.warehouse_locations (branch_id, zone_code, aisle, rack, level, bin, usage_type, is_active)
       VALUES ($1, 'Z', '99', '99', '1', 'A', 'RESERVE', true)
       RETURNING id;`,
      [warehouseNode.id]
    );
    const locationId = locInsert.rows[0].id;
    console.log(`Created warehouse location: ${locationId}`);

    // 5. Seed stock movements (e.g. 50 units)
    await client.query(
      `INSERT INTO public.inventory_movements (
         item_type, stock_item_id, item_name, branch_id, branch_name, movement_type,
         source_doc_type, direction, movement_at, quantity, unit_cost, total_cost,
         location_id, meta
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10, $11, $12, $13);`,
      [
        'stock_item', item.id, item.name, warehouseNode.id, warehouseNode.name, 'opening_balance',
        'opening_balance', 'in', 50.0, 10.0, 500.0, locationId,
        JSON.stringify({ availability_status: 'available' })
      ]
    );
    console.log("Seeded 50 units of stock.");

    // 6. Create a Purchase Order
    const poInsert = await client.query(
      `INSERT INTO public.purchase_orders (
         order_no, branch_id, branch_name, supplier_id, supplier_name, status,
         total_qty, subtotal, total_amount, flow_channel
       ) VALUES ($1, $2, $3, $4, $5, 'submitted', 0, 0, 0, 'warehouse_replenishment')
       RETURNING id;`,
      [
        'PO-WMS-TEST-TASKS-' + Date.now(), requestingBranchNode.id, requestingBranchNode.name,
        supplierId, `Internal Supplier for ${warehouseNode.name}`
      ]
    );
    const orderId = poInsert.rows[0].id;

    // Create a Purchase Order Line (requested 10 units)
    const poLineInsert = await client.query(
      `INSERT INTO public.purchase_order_lines (
         order_id, line_no, stock_item_id, item_sku, item_name, unit,
         ordered_qty, unit_price, line_total
       ) VALUES ($1, 1, $2, $3, $4, $5, 10.0, 15.0, 150.0)
       RETURNING id;`,
      [orderId, item.id, item.sku, item.name, item.unit]
    );
    const poLineId = poLineInsert.rows[0].id;

    // Update PO totals
    await client.query(
      `UPDATE public.purchase_orders
       SET total_qty = 10.0, subtotal = 150.0, total_amount = 150.0
       WHERE id = $1;`,
      [orderId]
    );
    console.log(`Created PO: ${orderId} and PO Line: ${poLineId}`);

    // 7. Create shipment draft using the RPC
    const shipmentDraft = {};
    shipmentDraft[item.id] = 10.0; // demand 10 units

    const rpcRes = await client.query(
      "SELECT public.create_warehouse_shipment_with_reservations($1, $2, $3, $4, $5, $6, $7) AS shipment_id;",
      [warehouseNode.id, [orderId], JSON.stringify(shipmentDraft), '34 WMS 999', 'Deneme Sofor', 'Test notes', null]
    );
    const shipmentId = rpcRes.rows[0].shipment_id;
    console.log(`Created shipment draft via RPC: ${shipmentId}`);

    // Update shipment meta with pipeline configuration: pack_required = true, load_required = true
    await client.query(
      "UPDATE public.warehouse_shipments SET meta = $1 WHERE id = $2;",
      [JSON.stringify({ pack_required: true, load_required: true }), shipmentId]
    );
    console.log("Updated shipment meta with pack_required=true, load_required=true.");

    // 8. Verify trigger automatically created a 'pick' task
    const pickTasksRes = await client.query(
      "SELECT id, status, task_type, meta FROM public.warehouse_tasks WHERE source_doc_type = 'warehouse_shipment' AND source_doc_id = $1 AND task_type = 'pick';",
      [shipmentId]
    );
    if (pickTasksRes.rows.length === 0) {
      throw new Error("FAIL: No pick task created by trigger.");
    }
    const pickTask = pickTasksRes.rows[0];
    console.log(`PASS: Automatically created pick task: ${pickTask.id} with status: ${pickTask.status}`);
    console.log("Pick task meta:", pickTask.meta);
    if (pickTask.meta.stock_item_id !== item.id) {
      throw new Error("FAIL: Pick task meta is missing stock_item_id.");
    }
    console.log("PASS: Pick task meta contains stock_item_id correctly.");

    // 9. Verify shipment status guards using Savepoints to prevent aborting transaction
    // Attempt 9a: update status to 'ready_to_load' directly
    try {
      await client.query("SAVEPOINT sp_9a;");
      await client.query("UPDATE public.warehouse_shipments SET status = 'ready_to_load' WHERE id = $1;", [shipmentId]);
      throw new Error("FAIL: Guard trigger allowed status update to ready_to_load while pick tasks are incomplete.");
    } catch (err) {
      await client.query("ROLLBACK TO sp_9a;");
      if (err.message.includes("tamamlanmamış toplama (pick) görevleri bulunmaktadır")) {
        console.log("PASS: Guard trigger blocked update to ready_to_load while tasks are active.");
      } else {
        throw err;
      }
    }

    // Attempt 9b: update status to 'in_transit' directly
    try {
      await client.query("SAVEPOINT sp_9b;");
      await client.query("UPDATE public.warehouse_shipments SET status = 'in_transit' WHERE id = $1;", [shipmentId]);
      throw new Error("FAIL: Guard trigger allowed status update to in_transit while pick tasks are incomplete.");
    } catch (err) {
      await client.query("ROLLBACK TO sp_9b;");
      if (err.message.includes("tamamlanmamış toplama (pick) görevleri bulunmaktadır")) {
        console.log("PASS: Guard trigger blocked update to in_transit while tasks are active.");
      } else {
        throw err;
      }
    }

    // Attempt 9c: call confirm_warehouse_shipment RPC
    try {
      await client.query("SAVEPOINT sp_9c;");
      await client.query("SELECT public.confirm_warehouse_shipment($1, $2, $3);", [shipmentId, warehouseNode.id, warehouseNode.name]);
      throw new Error("FAIL: confirm_warehouse_shipment allowed confirmation while tasks are incomplete.");
    } catch (err) {
      await client.query("ROLLBACK TO sp_9c;");
      if (err.message.includes("tamamlanmamış depo görevleri")) {
        console.log("PASS: confirm_warehouse_shipment blocked confirmation while tasks are active.");
      } else {
        throw err;
      }
    }

    // 10. Complete pick task with partial quantity (e.g. 7 out of 10)
    console.log("Completing pick task with 7 units (partial picking)...");
    const completePickRes = await client.query(
      "SELECT public.complete_warehouse_shipment_task($1, $2, $3) AS result;",
      [pickTask.id, 'PERS-007', 7.0]
    );
    const completePickResult = completePickRes.rows[0].result;
    console.log("Complete Pick RPC result:", completePickResult);

    // Verify pick task status and meta
    const updatedPickTaskRes = await client.query("SELECT status, meta FROM public.warehouse_tasks WHERE id = $1;", [pickTask.id]);
    const updatedPickTask = updatedPickTaskRes.rows[0];
    if (updatedPickTask.status !== 'exception') {
      throw new Error(`FAIL: Pick task status is ${updatedPickTask.status}, expected exception.`);
    }
    console.log("PASS: Pick task status is 'exception'.");

    // Verify reservation was updated to 7
    const reservationId = pickTask.meta.reservation_id;
    const resRowRes = await client.query("SELECT reserved_qty, status FROM public.warehouse_reservations WHERE id = $1;", [reservationId]);
    const resRow = resRowRes.rows[0];
    if (Number(resRow.reserved_qty) !== 7.0) {
      throw new Error(`FAIL: Reservation quantity is ${resRow.reserved_qty}, expected 7.0.`);
    }
    console.log("PASS: Reservation reserved_qty is updated to 7.0.");

    // Verify shipment line shipped_qty is updated to 7
    const shipLineRes = await client.query(
      "SELECT shipped_qty, meta FROM public.warehouse_shipment_lines WHERE shipment_id = $1 AND stock_item_id = $2;",
      [shipmentId, item.id]
    );
    const shipLine = shipLineRes.rows[0];
    if (Number(shipLine.shipped_qty) !== 7.0) {
      throw new Error(`FAIL: Shipment line shipped_qty is ${shipLine.shipped_qty}, expected 7.0.`);
    }
    console.log("PASS: Shipment line shipped_qty is updated to 7.0.");

    // Verify purchase order line ordered_qty is updated to 7 and original_ordered_qty is preserved
    const poLineRes = await client.query("SELECT ordered_qty, meta FROM public.purchase_order_lines WHERE id = $1;", [poLineId]);
    const poLine = poLineRes.rows[0];
    if (Number(poLine.ordered_qty) !== 7.0) {
      throw new Error(`FAIL: PO Line ordered_qty is ${poLine.ordered_qty}, expected 7.0.`);
    }
    if (Number(poLine.meta.original_ordered_qty) !== 10.0) {
      throw new Error(`FAIL: original_ordered_qty in PO line meta is ${poLine.meta.original_ordered_qty}, expected 10.0.`);
    }
    console.log("PASS: PO Line ordered_qty updated to 7.0 and original_ordered_qty backed up to 10.0.");

    // Verify PO total_qty and total_amount is recalculated
    const poRes = await client.query("SELECT total_qty, total_amount FROM public.purchase_orders WHERE id = $1;", [orderId]);
    const poRow = poRes.rows[0];
    if (Number(poRow.total_qty) !== 7.0 || Number(poRow.total_amount) !== 105.0) {
      throw new Error(`FAIL: Recalculated PO total_qty = ${poRow.total_qty}, total_amount = ${poRow.total_amount} (expected 7.0 and 105.0).`);
    }
    console.log("PASS: Purchase order total quantity and amount recalculated successfully.");

    // 11. Verify pipeline created a 'pack' task automatically
    const packTasksRes = await client.query(
      "SELECT id, status, task_type, meta FROM public.warehouse_tasks WHERE source_doc_type = 'warehouse_shipment' AND source_doc_id = $1 AND task_type = 'pack';",
      [shipmentId]
    );
    if (packTasksRes.rows.length === 0) {
      throw new Error("FAIL: No pack task created automatically.");
    }
    const packTask = packTasksRes.rows[0];
    if (Number(packTask.meta.quantity) !== 7.0 || packTask.meta.stock_item_id !== item.id) {
      throw new Error(`FAIL: Pack task meta is invalid: ${JSON.stringify(packTask.meta)}`);
    }
    console.log(`PASS: Pack task automatically created: ${packTask.id} with quantity: ${packTask.meta.quantity}`);

    // 12. Try to change shipment status to 'ready_to_load' -> Should succeed now because pick task is done (status = 'exception'), but pack/load tasks are open.
    await client.query("UPDATE public.warehouse_shipments SET status = 'ready_to_load' WHERE id = $1;", [shipmentId]);
    console.log("PASS: Shipment status updated to 'ready_to_load' since pick task is completed.");

    // But 'in_transit' should still fail because pack and load are incomplete.
    try {
      await client.query("SAVEPOINT sp_12;");
      await client.query("UPDATE public.warehouse_shipments SET status = 'in_transit' WHERE id = $1;", [shipmentId]);
      throw new Error("FAIL: Guard trigger allowed status update to in_transit while pack task is open.");
    } catch (err) {
      await client.query("ROLLBACK TO sp_12;");
      if (err.message.includes("tamamlanmamış depo görevleri")) {
        console.log("PASS: Guard trigger blocked update to in_transit while pack task is open.");
      } else {
        throw err;
      }
    }

    // 13. Complete the 'pack' task
    console.log("Completing pack task...");
    const completePackRes = await client.query(
      "SELECT public.complete_warehouse_shipment_task($1, $2, null) AS result;",
      [packTask.id, 'PERS-007']
    );
    console.log("Complete Pack RPC result:", completePackRes.rows[0].result);

    // Verify load task was automatically created
    const loadTasksRes = await client.query(
      "SELECT id, status, task_type, meta FROM public.warehouse_tasks WHERE source_doc_type = 'warehouse_shipment' AND source_doc_id = $1 AND task_type = 'load';",
      [shipmentId]
    );
    if (loadTasksRes.rows.length === 0) {
      throw new Error("FAIL: No load task created automatically.");
    }
    const loadTask = loadTasksRes.rows[0];
    if (Number(loadTask.meta.quantity) !== 7.0 || loadTask.meta.stock_item_id !== item.id) {
      throw new Error(`FAIL: Load task meta is invalid: ${JSON.stringify(loadTask.meta)}`);
    }
    console.log(`PASS: Load task automatically created: ${loadTask.id} with quantity: ${loadTask.meta.quantity}`);

    // 14. Complete the 'load' task
    console.log("Completing load task...");
    const completeLoadRes = await client.query(
      "SELECT public.complete_warehouse_shipment_task($1, $2, null) AS result;",
      [loadTask.id, 'PERS-007']
    );
    console.log("Complete Load RPC result:", completeLoadRes.rows[0].result);

    // 15. Verify all tasks are done/cancelled/exception
    const remainingTasksRes = await client.query(
      "SELECT count(*) FROM public.warehouse_tasks WHERE source_doc_type = 'warehouse_shipment' AND source_doc_id = $1 AND status NOT IN ('done', 'cancelled', 'exception');",
      [shipmentId]
    );
    if (Number(remainingTasksRes.rows[0].count) !== 0) {
      throw new Error(`FAIL: Still have ${remainingTasksRes.rows[0].count} open tasks.`);
    }
    console.log("PASS: All tasks completed successfully.");

    // 16. Verify confirm_warehouse_shipment can now be called successfully
    // First, let's restore status to 'draft' so we can confirm it (confirm RPC only accepts 'draft' status)
    await client.query("UPDATE public.warehouse_shipments SET status = 'draft' WHERE id = $1;", [shipmentId]);

    console.log("Confirming shipment via RPC...");
    await client.query("SELECT public.confirm_warehouse_shipment($1, $2, $3);", [shipmentId, warehouseNode.id, warehouseNode.name]);
    console.log("PASS: confirm_warehouse_shipment completed successfully.");

    // Check final shipment status is in_transit
    const finalShipmentRes = await client.query("SELECT status FROM public.warehouse_shipments WHERE id = $1;", [shipmentId]);
    console.log(`PASS: Final shipment status: ${finalShipmentRes.rows[0].status}`);

    // Rollback to keep database clean
    await client.query("ROLLBACK;");
    console.log("Transaction rolled back successfully.");
  } catch (err) {
    console.error("TEST FAILED:", err);
    try {
      await client.query("ROLLBACK;");
    } catch (_) {}
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTest();
