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

    // 1. Pick or setup warehouse (anadepo) and branch (sube) nodes
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
    console.log(`Warehouse node: ${warehouseNode.name} (ID: ${warehouseNode.id})`);
    console.log(`Branch node: ${requestingBranchNode.name} (ID: ${requestingBranchNode.id})`);

    // 2. Select a stock item
    const itemRes = await client.query("SELECT id, name, sku, unit FROM public.stock_items WHERE deleted_at IS NULL LIMIT 1;");
    if (itemRes.rows.length === 0) {
      console.log("No stock items found. Skipping.");
      await client.query("ROLLBACK;");
      await client.end();
      return;
    }
    const item = itemRes.rows[0];
    console.log(`Stock Item for test: ${item.name} (ID: ${item.id})`);

    // 3. Setup internal warehouse supplier for the warehouse node
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
      console.log(`Created internal warehouse supplier: ${supplierId}`);
    } else {
      supplierId = supplierRes.rows[0].id;
      console.log(`Using existing internal warehouse supplier: ${supplierId}`);
    }

    // 4. Setup dummy warehouse location
    const locInsert = await client.query(
      `INSERT INTO public.warehouse_locations (branch_id, zone_code, aisle, rack, level, bin, usage_type, is_active)
       VALUES ($1, 'Z', '99', '99', '1', 'A', 'RESERVE', true)
       RETURNING id;`,
      [warehouseNode.id]
    );
    const locationId = locInsert.rows[0].id;
    console.log(`Created warehouse location ID: ${locationId}`);

    // 5. Seed stock movements (e.g. 100 units)
    await client.query(
      `INSERT INTO public.inventory_movements (
         item_type, stock_item_id, item_name, branch_id, branch_name, movement_type,
         source_doc_type, direction, movement_at, quantity, unit_cost, total_cost,
         location_id, meta
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10, $11, $12, $13);`,
      [
        'stock_item', item.id, item.name, warehouseNode.id, warehouseNode.name, 'purchase_receipt',
        'purchase_receipt', 'in', 100.0, 10.0, 1000.0, locationId,
        JSONB.stringify({ availability_status: 'available' })
      ]
    );
    console.log("Seeded 100 units of stock to warehouse node.");

    // 6. Create a Purchase Order
    const poInsert = await client.query(
      `INSERT INTO public.purchase_orders (
         order_no, branch_id, branch_name, supplier_id, supplier_name, status,
         total_qty, subtotal, total_amount, flow_channel
       ) VALUES ($1, $2, $3, $4, $5, 'pending_action', 0, 0, 0, 'warehouse_replenishment')
       RETURNING id;`,
      [
        'PO-WMS-TEST-' + Date.now(), requestingBranchNode.id, requestingBranchNode.name,
        supplierId, `Internal Supplier for ${warehouseNode.name}`
      ]
    );
    const orderId = poInsert.rows[0].id;
    console.log(`Created Purchase Order ID: ${orderId}`);

    // Create a PO Line
    const poLineInsert = await client.query(
      `INSERT INTO public.purchase_order_lines (
         order_id, stock_item_id, item_name, item_sku, unit, ordered_qty, unit_price, line_total
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id;`,
      [orderId, item.id, item.name, item.sku, item.unit || 'Adet', 15.0, 10.0, 150.0]
    );
    const poLineId = poLineInsert.rows[0].id;
    console.log(`Created PO Line ID: ${poLineId} for 15 units.`);

    // 7. Update PO totals
    await client.query(
      "UPDATE public.purchase_orders SET total_qty = 15, subtotal = 150, total_amount = 150 WHERE id = $1;",
      [orderId]
    );

    // 8. Call create_warehouse_shipment_with_reservations for 10 units (draft)
    const shipmentDraft = { [item.id]: 10.0 };
    console.log("Calling create_warehouse_shipment_with_reservations RPC for 10 units...");
    const rpcRes = await client.query(
      "SELECT public.create_warehouse_shipment_with_reservations($1, $2, $3, $4, $5, $6, $7) AS shipment_id;",
      [
        warehouseNode.id,
        [orderId],
        JSON.stringify(shipmentDraft),
        '34TEST99',
        'Test Driver',
        'Test notes',
        null
      ]
    );
    const shipmentId = rpcRes.rows[0].shipment_id;
    console.log(`Successfully created shipment draft ID: ${shipmentId}`);

    // Set all created pick tasks to 'done' so they don't block confirm_warehouse_shipment guard in this legacy test
    await client.query("UPDATE public.warehouse_tasks SET status = 'done' WHERE source_doc_id = $1;", [shipmentId]);

    // 9. Verify reservations created
    const resCount = await client.query(
      "SELECT id, reserved_qty, status FROM public.warehouse_reservations WHERE source_doc_id = $1;",
      [shipmentId]
    );
    console.log(`Found ${resCount.rows.length} reservation(s) associated with shipment:`);
    resCount.rows.forEach(r => {
      console.log(`  - Res ID: ${r.id}, Qty: ${r.reserved_qty}, Status: ${r.status}`);
      if (r.status !== 'active') throw new Error("Reservation status must be active for draft shipment!");
      if (Number(r.reserved_qty) !== 10.0) throw new Error("Reservation quantity must match picked quantity!");
    });

    // 10. Check if shipment lines has picks with reservation ID
    const lineRes = await client.query(
      "SELECT id, shipped_qty, meta FROM public.warehouse_shipment_lines WHERE shipment_id = $1;",
      [shipmentId]
    );
    if (lineRes.rows.length === 0) throw new Error("Shipment line was not created!");
    const line = lineRes.rows[0];
    console.log(`Shipment line shipped_qty: ${line.shipped_qty}`);
    console.log(`Shipment line meta picks: ${JSON.stringify(line.meta.picks)}`);
    if (!line.meta.picks || line.meta.picks.length === 0) throw new Error("Picks missing from shipment line meta!");
    if (!line.meta.picks[0].reservation_id) throw new Error("Reservation ID missing from picks meta!");

    // 11. Verify PO Line ordered_qty is updated and original quantity is saved to meta
    const poLineCheck = await client.query(
      "SELECT ordered_qty, meta FROM public.purchase_order_lines WHERE id = $1;",
      [poLineId]
    );
    const poLine = poLineCheck.rows[0];
    console.log(`PO Line ordered_qty is now: ${poLine.ordered_qty}`);
    console.log(`PO Line meta: ${JSON.stringify(poLine.meta)}`);
    if (Number(poLine.ordered_qty) !== 10.0) throw new Error("PO Line ordered_qty was not updated to shipped quantity!");
    if (Number(poLine.meta.original_ordered_qty) !== 15.0) throw new Error("Original ordered quantity was not preserved in meta!");

    // 12. Test double booking protection (try to pick 150 units when only 90 are pickable: 100 physical - 10 active reservation = 90 available)
    console.log("Testing double-booking protection (insufficient stock fail-closed)...");
    
    // Create PO 2
    const po2Insert = await client.query(
      `INSERT INTO public.purchase_orders (
         order_no, branch_id, branch_name, supplier_id, supplier_name, status,
         total_qty, subtotal, total_amount, flow_channel
       ) VALUES ($1, $2, $3, $4, $5, 'pending_action', 0, 0, 0, 'warehouse_replenishment')
       RETURNING id;`,
      [
        'PO-WMS-TEST-2-' + Date.now(), requestingBranchNode.id, requestingBranchNode.name,
        supplierId, `Internal Supplier for ${warehouseNode.name}`
      ]
    );
    const order2Id = po2Insert.rows[0].id;

    // Create a PO Line with 150 units
    await client.query(
      `INSERT INTO public.purchase_order_lines (
         order_id, stock_item_id, item_name, item_sku, unit, ordered_qty, unit_price, line_total
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
      [order2Id, item.id, item.name, item.sku, item.unit || 'Adet', 150.0, 10.0, 1500.0]
    );

    // Update PO 2 totals
    await client.query(
      "UPDATE public.purchase_orders SET total_qty = 150, subtotal = 1500, total_amount = 1500 WHERE id = $1;",
      [order2Id]
    );

    await client.query("SAVEPOINT over_draft_savepoint;");
    try {
      const overDraft = { [item.id]: 150.0 };
      await client.query(
        "SELECT public.create_warehouse_shipment_with_reservations($1, $2, $3, $4, $5, $6, $7) AS shipment_id;",
        [
          warehouseNode.id,
          [order2Id],
          JSON.stringify(overDraft),
          '34TEST99',
          'Test Driver',
          'Test notes',
          null
        ]
      );
      throw new Error("Double booking check failed! Function should have thrown insufficient stock exception.");
    } catch (err) {
      if (err.message.includes("Stok yetersiz!")) {
        console.log("✅ Expected Exception Caught: " + err.message);
        await client.query("ROLLBACK TO SAVEPOINT over_draft_savepoint;");
      } else {
        throw err;
      }
    }

    // 13. Confirm the shipment draft and verify reservation transitions to consumed
    console.log("Confirming shipment to check reservation consumption...");
    await client.query(
      "SELECT public.confirm_warehouse_shipment($1, $2, $3);",
      [shipmentId, warehouseNode.id, warehouseNode.name]
    );

    const resCheckAfterConfirm = await client.query(
      "SELECT status, consumed_at FROM public.warehouse_reservations WHERE source_doc_id = $1;",
      [shipmentId]
    );
    resCheckAfterConfirm.rows.forEach(r => {
      console.log(`Reservation Status post-confirm: ${r.status}, Consumed At: ${r.consumed_at}`);
      if (r.status !== 'consumed') throw new Error("Reservation was not consumed upon shipment confirmation!");
      if (!r.consumed_at) throw new Error("consumed_at must be populated when status changes to consumed!");
    });

    console.log("✅ [ALL TESTS PASSED] WMS-01C Reservation transaction works perfectly!");

    // Rollback transaction to keep DB clean
    await client.query("ROLLBACK;");
    console.log("Transaction rolled back successfully.");
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

// Helper to handle JSONB stringify in sql parameters
const JSONB = {
  stringify: (obj) => JSON.stringify(obj)
};

runTest();
