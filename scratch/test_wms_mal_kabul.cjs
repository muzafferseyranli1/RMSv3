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

    // 1. Get a mock branch, supplier, stock item, location and LPN
    const branchRes = await client.query("SELECT id, name FROM public.company_nodes WHERE type IN ('sube', 'anadepo', 'branch') LIMIT 1;");
    if (branchRes.rows.length === 0) {
      console.log('No branches found to run test. Skipping.');
      return;
    }
    const branch = branchRes.rows[0];

    const supplierRes = await client.query('SELECT id, name FROM public.suppliers LIMIT 1;');
    if (supplierRes.rows.length === 0) {
      console.log('No suppliers found to run test. Skipping.');
      return;
    }
    const supplier = supplierRes.rows[0];

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
      // create mock location
      const newLoc = await client.query(
        `INSERT INTO public.warehouse_locations (branch_id, zone_code, aisle, rack, level, bin, usage_type, is_active) VALUES ($1, 'Z9', '9', '9', '9', '9', 'RESERVE', true) RETURNING id;`,
        [branch.id]
      );
      locationId = newLoc.rows[0].id;
      console.log(`Created mock warehouse location: ${locationId}`);
    } else {
      locationId = locationRes.rows[0].id;
    }

    // Find or create a warehouse LPN
    let lpnRes = await client.query(`SELECT id FROM public.warehouse_lpns WHERE branch_id = $1 LIMIT 1;`, [branch.id]);
    let lpnId;
    if (lpnRes.rows.length === 0) {
      // create mock LPN
      const newLpn = await client.query(
        `INSERT INTO public.warehouse_lpns (lpn_code, branch_id, status, location_id) VALUES ('TEST-LPN-001', $1, 'active', $2) RETURNING id;`,
        [branch.id, locationId]
      );
      lpnId = newLpn.rows[0].id;
      console.log(`Created mock warehouse LPN: ${lpnId}`);
    } else {
      lpnId = lpnRes.rows[0].id;
    }

    console.log(`Selected metadata for test:
      Branch: "${branch.name}" (ID: ${branch.id})
      Supplier: "${supplier.name}" (ID: ${supplier.id})
      Item: "${item.name}" (ID: ${item.id})
      Location ID: ${locationId}
      LPN ID: ${lpnId}
    `);

    // 2. Insert mock purchase_receipts
    const receiptNo = 'MK-TEST-WMS-' + Date.now();
    const receiptPayload = {
      receipt_no: receiptNo,
      branch_id: branch.id,
      branch_name: branch.name,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      delivered_on: new Date().toISOString().split('T')[0],
      status: 'completed',
      total_qty: 10,
      subtotal: 100.0,
      total_amount: 100.0,
      total_amount_vat_inc: 110.0,
      meta: {}
    };

    const receiptInsert = await client.query(
      `INSERT INTO public.purchase_receipts (receipt_no, branch_id, branch_name, supplier_id, supplier_name, delivered_on, status, total_qty, subtotal, total_amount, total_amount_vat_inc, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id;`,
      [
        receiptPayload.receipt_no,
        receiptPayload.branch_id,
        receiptPayload.branch_name,
        receiptPayload.supplier_id,
        receiptPayload.supplier_name,
        receiptPayload.delivered_on,
        receiptPayload.status,
        receiptPayload.total_qty,
        receiptPayload.subtotal,
        receiptPayload.total_amount,
        receiptPayload.total_amount_vat_inc,
        JSON.stringify(receiptPayload.meta)
      ]
    );
    const receiptId = receiptInsert.rows[0].id;
    console.log(`Inserted mock purchase_receipt ID: ${receiptId}`);

    // 3. Insert mock purchase_receipt_lines
    const linePayload = {
      receipt_id: receiptId,
      stock_item_id: item.id,
      item_name: item.name,
      item_sku: item.sku || '',
      unit: item.unit || 'adet',
      received_qty: 10,
      unit_price: 10.0,
      vat_rate: 0.1,
      line_total: 100.0,
      line_total_vat_inc: 110.0,
      meta: {
        location_id: locationId,
        lpn_id: lpnId,
        lot_number: 'LOT-999-WMS',
        expiration_date: '2027-12-31',
        availability_status: 'quarantine' // karantina testi
      },
      line_no: 1
    };

    const lineInsert = await client.query(
      `INSERT INTO public.purchase_receipt_lines (receipt_id, stock_item_id, item_name, item_sku, unit, received_qty, unit_price, vat_rate, line_total, line_total_vat_inc, meta, line_no)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id;`,
      [
        linePayload.receipt_id,
        linePayload.stock_item_id,
        linePayload.item_name,
        linePayload.item_sku,
        linePayload.unit,
        linePayload.received_qty,
        linePayload.unit_price,
        linePayload.vat_rate,
        linePayload.line_total,
        linePayload.line_total_vat_inc,
        JSON.stringify(linePayload.meta),
        linePayload.line_no
      ]
    );
    const lineId = lineInsert.rows[0].id;
    console.log(`Inserted mock purchase_receipt_line ID: ${lineId}`);

    // 4. Insert mock inventory_movements (with direct WMS columns)
    const movementPayload = {
      item_type: 'stock_item',
      stock_item_id: item.id,
      item_name: item.name,
      branch_id: branch.id,
      branch_name: branch.name,
      movement_type: 'purchase_receipt',
      source_doc_type: 'purchase_receipt',
      direction: 'in',
      movement_at: new Date().toISOString(),
      quantity: 10,
      source_doc_id: receiptId,
      source_doc_line_id: lineId,
      source_doc_no: receiptNo,
      supplier_id: supplier.id,
      unit_cost: 10.0,
      total_cost: 100.0,
      location_id: locationId,
      lpn_id: lpnId,
      lot_number: 'LOT-999-WMS',
      expiration_date: '2027-12-31',
      meta: {
        availability_status: 'quarantine'
      }
    };

    const movementInsert = await client.query(
      `INSERT INTO public.inventory_movements (item_type, stock_item_id, item_name, branch_id, branch_name, movement_type, source_doc_type, direction, movement_at, quantity, source_doc_id, source_doc_line_id, source_doc_no, supplier_id, unit_cost, total_cost, location_id, lpn_id, lot_number, expiration_date, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING id;`,
      [
        movementPayload.item_type,
        movementPayload.stock_item_id,
        movementPayload.item_name,
        movementPayload.branch_id,
        movementPayload.branch_name,
        movementPayload.movement_type,
        movementPayload.source_doc_type,
        movementPayload.direction,
        movementPayload.movement_at,
        movementPayload.quantity,
        movementPayload.source_doc_id,
        movementPayload.source_doc_line_id,
        movementPayload.source_doc_no,
        movementPayload.supplier_id,
        movementPayload.unit_cost,
        movementPayload.total_cost,
        movementPayload.location_id,
        movementPayload.lpn_id,
        movementPayload.lot_number,
        movementPayload.expiration_date,
        JSON.stringify(movementPayload.meta)
      ]
    );
    const movementId = movementInsert.rows[0].id;
    console.log(`Inserted mock inventory_movement ID: ${movementId}`);

    // 5. Read back and Verify WMS values in DB columns!
    const verifyRes = await client.query(
      `SELECT id, location_id, lpn_id, lot_number, expiration_date::text, meta FROM public.inventory_movements WHERE id = $1;`,
      [movementId]
    );
    const verifyRow = verifyRes.rows[0];

    console.log('\n--- VERIFICATION DETAILS ---');
    console.log(`Inserted Movement ID: ${verifyRow.id}`);
    console.log(`Direct location_id: ${verifyRow.location_id} (Expected: ${locationId})`);
    console.log(`Direct lpn_id: ${verifyRow.lpn_id} (Expected: ${lpnId})`);
    console.log(`Direct lot_number: ${verifyRow.lot_number} (Expected: 'LOT-999-WMS')`);
    console.log(`Direct expiration_date: ${verifyRow.expiration_date} (Expected: '2027-12-31')`);
    console.log(`Meta Availability Status: ${verifyRow.meta?.availability_status} (Expected: 'quarantine')`);

    if (
      verifyRow.location_id === locationId &&
      verifyRow.lpn_id === lpnId &&
      verifyRow.lot_number === 'LOT-999-WMS' &&
      verifyRow.expiration_date === '2027-12-31' &&
      verifyRow.meta?.availability_status === 'quarantine'
    ) {
      console.log('\n✅ WMS Mal Kabul Database Columns Verification SUCCESSFUL!');
    } else {
      console.log('\n❌ WMS Mal Kabul Database Columns Verification FAILED!');
    }

  } catch (err) {
    console.error('Error during WMS mal kabul DB verification:', err);
  } finally {
    try {
      await client.query('ROLLBACK;');
      console.log('Transaction rolled back successfully. No permanent changes were made to the database.');
    } catch (rollbackErr) {
      console.error('Failed to rollback transaction:', rollbackErr.message);
    }
    await client.end();
  }
}

main();
