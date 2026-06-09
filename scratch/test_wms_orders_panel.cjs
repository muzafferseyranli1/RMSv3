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
      return;
    }
    const item = itemRes.rows[0];
    console.log(`Stock Item for test: ${item.name} (ID: ${item.id})`);

    // 3. Upsert synced internal warehouse supplier for the warehouse node
    const syncKey = `anadepo_test_${warehouseNode.id}`;
    let supplierRes = await client.query(
      `INSERT INTO public.suppliers (name, supplier_kind, source_branch_id, is_system_generated, sync_key)
       VALUES ($1, 'internal_warehouse', $2, true, $3)
       ON CONFLICT (sync_key) DO UPDATE SET name = EXCLUDED.name, deleted_at = null
       RETURNING id, name;`,
      [`Test İç Depo (${warehouseNode.name})`, warehouseNode.id, syncKey]
    );
    const supplier = supplierRes.rows[0];
    console.log(`Internal supplier configured: ${supplier.name} (ID: ${supplier.id})`);

    // 4. Create a replenishment purchase order
    const orderNo = 'PO-REPL-TEST-' + Date.now();
    const orderInsert = await client.query(
      `INSERT INTO public.purchase_orders (order_no, branch_id, branch_name, supplier_id, supplier_name, flow_channel, status, total_qty, subtotal, total_amount, meta)
       VALUES ($1, $2, $3, $4, $5, 'warehouse_replenishment', 'submitted', 15.0, 150.0, 150.0, '{}'::jsonb)
       RETURNING id;`,
      [orderNo, requestingBranchNode.id, requestingBranchNode.name, supplier.id, supplier.name]
    );
    const orderId = orderInsert.rows[0].id;
    console.log(`Inserted replenishment purchase_order ID: ${orderId} (No: ${orderNo})`);

    // 5. Create a purchase order line
    const lineInsert = await client.query(
      `INSERT INTO public.purchase_order_lines (order_id, line_no, stock_item_id, item_name, item_sku, unit, ordered_qty, unit_price, line_total, meta)
       VALUES ($1, 1, $2, $3, $4, $5, 15.0, 10.0, 150.0, '{}'::jsonb)
       RETURNING id;`,
      [orderId, item.id, item.name, item.sku, item.unit || 'adet']
    );
    const lineId = lineInsert.rows[0].id;
    console.log(`Inserted line ID: ${lineId} (Ordered Qty: 15.0, Line Total: 150.0)`);

    // 6. Insert inventory movements for the warehouse node:
    // We will insert 2 movements:
    // - One "available" stock movement of +100 units
    // - One "quarantine" stock movement of +30 units
    const movement1 = await client.query(
      `INSERT INTO public.inventory_movements (item_type, stock_item_id, item_name, branch_id, branch_name, movement_type, source_doc_type, direction, movement_at, quantity, unit_cost, total_cost, meta)
       VALUES ('stock_item', $1, $2, $3, $4, 'manual_adjustment_in', 'manual_adjustment', 'in', now(), 100.0, 10.0, 1000.0, '{"availability_status": "available"}'::jsonb)
       RETURNING id;`,
      [item.id, item.name, warehouseNode.id, warehouseNode.name]
    );
    const movement2 = await client.query(
      `INSERT INTO public.inventory_movements (item_type, stock_item_id, item_name, branch_id, branch_name, movement_type, source_doc_type, direction, movement_at, quantity, unit_cost, total_cost, meta)
       VALUES ('stock_item', $1, $2, $3, $4, 'manual_adjustment_in', 'manual_adjustment', 'in', now(), 30.0, 10.0, 300.0, '{"availability_status": "quarantine"}'::jsonb)
       RETURNING id;`,
      [item.id, item.name, warehouseNode.id, warehouseNode.name]
    );

    console.log(`Inserted stock movements for warehouse:
      Available: +100 units (ID: ${movement1.rows[0].id})
      Quarantine: +30 units (ID: ${movement2.rows[0].id})
    `);

    // 7. Verify dynamic available stock calculations (simulating the UI logic)
    // We fetch all movements for this warehouse branch
    const movementsRes = await client.query(
      `SELECT stock_item_id, quantity, direction, meta FROM public.inventory_movements WHERE branch_id = $1 AND deleted_at IS NULL;`,
      [warehouseNode.id]
    );

    let physicalQty = 0;
    let quarantineQty = 0;
    for (const row of movementsRes.rows) {
      if (row.stock_item_id !== item.id) continue;
      const qty = Number(row.quantity);
      const signed = row.direction === 'in' ? qty : -qty;
      physicalQty += signed;
      if (row.meta?.availability_status === 'quarantine' || row.meta?.availability_status === 'putaway_pending') {
        quarantineQty += signed;
      }
    }
    const calculatedAvailable = Math.max(physicalQty - quarantineQty, 0);
    console.log(`\n--- DYNAMIC STOCK CALCULATIONS ---`);
    console.log(`Total Physical Stock: ${physicalQty} (Expected: 130)`);
    console.log(`Total Quarantine Stock: ${quarantineQty} (Expected: 30)`);
    console.log(`Calculated Available Stock: ${calculatedAvailable} (Expected: 100)`);

    const isStockSufficient = calculatedAvailable >= 15.0; // We requested 15
    console.log(`Is stock sufficient for request of 15? ${isStockSufficient ? 'YES' : 'NO'} (Expected: YES)`);

    // 8. Test partial fulfillment & manual quantity adjustment
    // Warehouse worker edits requested quantity from 15.0 to 12.0
    const newQty = 12.0;
    const oldQty = 15.0;

    // Simulate saving quantity edits:
    const lineMeta = { original_ordered_qty: oldQty };
    const newLineTotal = newQty * 10.0;

    await client.query(
      `UPDATE public.purchase_order_lines SET ordered_qty = $1, line_total = $2, meta = $3, updated_at = now() WHERE id = $4;`,
      [newQty, newLineTotal, JSON.stringify(lineMeta), lineId]
    );
    console.log(`\nLine updated: Ordered Qty changed to 12.0, original quantity stored in meta.`);

    // Update order totals
    await client.query(
      `UPDATE public.purchase_orders SET total_qty = $1, total_amount = $2, subtotal = $2, updated_at = now() WHERE id = $3;`,
      [newQty, newLineTotal, orderId]
    );
    console.log(`Order totals updated: total_qty = 12.0, total_amount = 120.0`);

    // Read back and verify quantity updates
    const verifyLine = await client.query(`SELECT ordered_qty, line_total, meta FROM public.purchase_order_lines WHERE id = $1;`, [lineId]);
    const verifyOrder = await client.query(`SELECT total_qty, total_amount FROM public.purchase_orders WHERE id = $1;`, [orderId]);

    console.log(`\n--- QUANTITY ADJUSTMENT VERIFICATION ---`);
    console.log(`Verified line ordered_qty: ${Number(verifyLine.rows[0].ordered_qty)} (Expected: 12)`);
    console.log(`Verified line original_ordered_qty in meta: ${verifyLine.rows[0].meta?.original_ordered_qty} (Expected: 15)`);
    console.log(`Verified order total_qty: ${Number(verifyOrder.rows[0].total_qty)} (Expected: 12)`);
    console.log(`Verified order total_amount: ${Number(verifyOrder.rows[0].total_amount)} (Expected: 120)`);

    // 9. Test dispatch (Sevk Et)
    const dispatchMeta = {
      supplier_marked_sent: true,
      supplier_sent_at: new Date().toISOString(),
      supplier_dispatch: {
        delivered_on: '2026-06-09',
        delivered_at: '12:00',
        doc_kind: 'irsaliye',
        doc_date: '2026-06-09',
        doc_no: 'IRS-WMS-TEST-01',
        plate_number: '34 WMS 102',
        note: 'Hızlı ikmal'
      }
    };

    await client.query(
      `UPDATE public.purchase_orders SET meta = $1, updated_at = now() WHERE id = $2;`,
      [JSON.stringify(dispatchMeta), orderId]
    );
    console.log('\nOrder marked as sent (dispatched) with plate number and document metadata.');

    // Read back and verify dispatch
    const verifyDispatch = await client.query(`SELECT meta FROM public.purchase_orders WHERE id = $1;`, [orderId]);
    const actualMeta = verifyDispatch.rows[0].meta;

    console.log(`\n--- DISPATCH VERIFICATION ---`);
    console.log(`supplier_marked_sent: ${actualMeta.supplier_marked_sent} (Expected: true)`);
    console.log(`Plate Number: ${actualMeta.supplier_dispatch?.plate_number} (Expected: '34 WMS 102')`);
    console.log(`Doc No: ${actualMeta.supplier_dispatch?.doc_no} (Expected: 'IRS-WMS-TEST-01')`);

    // 10. Overall Check
    if (
      calculatedAvailable === 100.0 &&
      Number(verifyLine.rows[0].ordered_qty) === 12.0 &&
      Number(verifyLine.rows[0].meta?.original_ordered_qty) === 15.0 &&
      Number(verifyOrder.rows[0].total_qty) === 12.0 &&
      actualMeta.supplier_marked_sent === true &&
      actualMeta.supplier_dispatch?.plate_number === '34 WMS 102'
    ) {
      console.log('\n✅ WMS Phase 5 Integration Test SUCCESSFUL!');
    } else {
      console.log('\n❌ WMS Phase 5 Integration Test FAILED!');
    }

  } catch (err) {
    console.error('Error during WMS Phase 5 verification:', err);
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
