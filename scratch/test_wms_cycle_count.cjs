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

    // Find an item, branch, location, and LPN that ALREADY has some balance
    const activeBalanceRes = await client.query(`
      SELECT 
        im.branch_id, 
        im.location_id, 
        im.lpn_id, 
        im.stock_item_id, 
        si.sku AS product_code,
        si.name AS product_name,
        COALESCE(wl.zone_code, 'LOC') AS zone_code,
        COALESCE(lp.lpn_code, '') AS lpn_code,
        SUM(CASE WHEN im.direction = 'in' THEN im.quantity ELSE -im.quantity END) AS balance
      FROM public.inventory_movements im
      JOIN public.stock_items si ON si.id = im.stock_item_id
      LEFT JOIN public.warehouse_locations wl ON wl.id = im.location_id
      LEFT JOIN public.warehouse_lpns lp ON lp.id = im.lpn_id
      WHERE im.item_type = 'stock_item' 
        AND im.is_cancelled = false 
        AND im.deleted_at IS NULL
        AND COALESCE(im.meta->>'availability_status', 'available') NOT IN ('quarantine', 'putaway_pending')
      GROUP BY im.branch_id, im.location_id, im.lpn_id, im.stock_item_id, si.sku, si.name, wl.zone_code, lp.lpn_code
      HAVING SUM(CASE WHEN im.direction = 'in' THEN im.quantity ELSE -im.quantity END) > 0
      LIMIT 1;
    `);

    let branchId, locationId, lpnId, stockItemId, productCode, productName, zoneCode, lpnCode, expectedQty;

    if (activeBalanceRes.rows.length > 0) {
      const row = activeBalanceRes.rows[0];
      branchId = row.branch_id;
      locationId = row.location_id;
      lpnId = row.lpn_id;
      stockItemId = row.stock_item_id;
      productCode = row.product_code;
      productName = row.product_name;
      zoneCode = row.zone_code;
      lpnCode = row.lpn_code || null;
      expectedQty = parseFloat(row.balance);
      console.log(`Found active balance of ${expectedQty} for SKU ${productCode} at location ${zoneCode}. Using it.`);
    } else {
      console.log('No active balance found. Creating mock data...');
      // 1. Get mock data
      const branchRes = await client.query("SELECT id, name FROM public.company_nodes WHERE type IN ('sube', 'anadepo', 'branch') LIMIT 1;");
      if (branchRes.rows.length === 0) {
        console.log('No branches found to run test. Skipping.');
        return;
      }
      const branch = branchRes.rows[0];
      branchId = branch.id;

      const itemRes = await client.query('SELECT id, name, sku, unit FROM public.stock_items WHERE deleted_at IS NULL LIMIT 1;');
      if (itemRes.rows.length === 0) {
        console.log('No stock items found to run test. Skipping.');
        return;
      }
      const item = itemRes.rows[0];
      stockItemId = item.id;
      productCode = item.sku;
      productName = item.name;

      // Find or create a warehouse location
      let locationRes = await client.query(`SELECT id FROM public.warehouse_locations WHERE branch_id = $1 LIMIT 1;`, [branchId]);
      if (locationRes.rows.length === 0) {
        const newLoc = await client.query(
          `INSERT INTO public.warehouse_locations (branch_id, zone_code, aisle, rack, level, bin, usage_type, is_active) VALUES ($1, 'Z9', '9', '9', '9', '9', 'RESERVE', true) RETURNING id;`,
          [branchId]
        );
        locationId = newLoc.rows[0].id;
      } else {
        locationId = locationRes.rows[0].id;
      }
      zoneCode = 'Z9';

      // Find or create a warehouse LPN
      let lpnRes = await client.query(`SELECT id FROM public.warehouse_lpns WHERE branch_id = $1 LIMIT 1;`, [branchId]);
      if (lpnRes.rows.length === 0) {
        const newLpn = await client.query(
          `INSERT INTO public.warehouse_lpns (lpn_code, branch_id, status, location_id) VALUES ('TEST-LPN-002', $1, 'active', $2) RETURNING id;`,
          [branchId, locationId]
        );
        lpnId = newLpn.rows[0].id;
      } else {
        lpnId = lpnRes.rows[0].id;
      }
      lpnCode = 'TEST-LPN-002';

      // Get organization details
      let companyId = branchId;
      let legalEntityId = null;
      let orgUnitId = null;
      let branchName = branch.name;
      let warehouseId = null;
      let warehouseName = 'Ana Depo';

      const entityRes = await client.query('SELECT company_id, legal_entity_id, org_unit_id, branch_name, warehouse_id, warehouse_name FROM public.inventory_movements LIMIT 1;');
      if (entityRes.rows.length > 0) {
        const row = entityRes.rows[0];
        companyId = row.company_id || companyId;
        legalEntityId = row.legal_entity_id || legalEntityId;
        orgUnitId = row.org_unit_id || orgUnitId;
        branchName = row.branch_name || branchName;
        warehouseId = row.warehouse_id || warehouseId;
        warehouseName = row.warehouse_name || warehouseName;
      }

      // Post an initial movement of 10 items
      await client.query(
        `INSERT INTO public.inventory_movements (
          company_id, legal_entity_id, org_unit_id, branch_id, branch_name, warehouse_id, warehouse_name,
          stock_item_id, item_name, item_sku, unit, direction, quantity, unit_cost, currency_code,
          movement_at, item_type, location_id, lpn_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'in', 10.0, 100.0, 'TRY', now(), 'stock_item', $12, $13);`,
        [companyId, legalEntityId, orgUnitId, branchId, branchName, warehouseId, warehouseName, stockItemId, productName, productCode, item.unit || 'Adet', locationId, lpnId]
      );
      expectedQty = 10.0;
      console.log('Inserted initial inventory balance of 10 units.');
    }

    const taskMeta = {
      location_id: locationId,
      lpn_id: lpnId,
      stock_item_id: stockItemId,
      product_code: productCode,
      product_name: productName,
      source_location: zoneCode,
      lpn_code: lpnCode,
      quantity: expectedQty
    };

    // --- TEST CASE 1: SUBMIT WITH DISCREPANCY & APPROVE ---
    console.log(`--- Test Case 1: Submit with discrepancy (${expectedQty + 2} units) ---`);
    await client.query('BEGIN;');
    const taskInsertRes1 = await client.query(
      `INSERT INTO public.warehouse_tasks (
        branch_id, task_type, status, meta
      ) VALUES ($1, 'count', 'pending', $2) RETURNING id;`,
      [branchId, JSON.stringify(taskMeta)]
    );
    const taskId1 = taskInsertRes1.rows[0].id;
    
    const submitDiscrepancyRes = await client.query(
      `SELECT public.submit_warehouse_count_task($1, 'TEST-STAFF', $2, 'Discrepancy test') AS result;`,
      [taskId1, expectedQty + 2.0]
    );
    const res1 = submitDiscrepancyRes.rows[0].result;
    console.log('Result:', res1);

    if (!res1.success || !res1.has_discrepancy || !res1.approval_id) {
      throw new Error('Test Case 1 failed: Expected success with discrepancy and approval_id');
    }

    // Check task status
    const task1 = (await client.query('SELECT status FROM public.warehouse_tasks WHERE id = $1;', [taskId1])).rows[0];
    if (task1.status !== 'done') {
      throw new Error('Task should be set to done');
    }

    // Verify approval record
    const approvalId = res1.approval_id;
    const approvalRecord = (await client.query('SELECT * FROM public.warehouse_count_approvals WHERE id = $1;', [approvalId])).rows[0];
    if (!approvalRecord || approvalRecord.status !== 'pending' || parseFloat(approvalRecord.difference_qty) !== 2.0) {
      throw new Error('Approval record discrepancy mismatch');
    }

    console.log('--- Test Case 1.1: Approve discrepancy ---');
    const approveRes = await client.query(
      `SELECT public.approve_warehouse_count_approval($1, 'TEST-MANAGER') AS result;`,
      [approvalId]
    );
    console.log('Approve RPC Result:', approveRes.rows[0].result);

    const approvedRecord = (await client.query('SELECT * FROM public.warehouse_count_approvals WHERE id = $1;', [approvalId])).rows[0];
    if (approvedRecord.status !== 'approved' || !approvedRecord.inventory_movement_id) {
      throw new Error('Approval record was not marked approved or lacks inventory_movement_id');
    }

    const movement = (await client.query('SELECT * FROM public.inventory_movements WHERE id = $1;', [approvedRecord.inventory_movement_id])).rows[0];
    if (!movement || movement.direction !== 'in' || parseFloat(movement.quantity) !== 2.0) {
      throw new Error('Stock adjustment movement was not correctly posted');
    }
    await client.query('ROLLBACK;');
    console.log('Test Case 1 completed successfully and rolled back.');

    // --- TEST CASE 2: SUBMIT WITHOUT DISCREPANCY ---
    console.log(`--- Test Case 2: Submit without discrepancy (${expectedQty} units) ---`);
    await client.query('BEGIN;');
    const taskInsertRes2 = await client.query(
      `INSERT INTO public.warehouse_tasks (
        branch_id, task_type, status, meta
      ) VALUES ($1, 'count', 'pending', $2) RETURNING id;`,
      [branchId, JSON.stringify(taskMeta)]
    );
    const taskId2 = taskInsertRes2.rows[0].id;

    const submitMatchRes = await client.query(
      `SELECT public.submit_warehouse_count_task($1, 'TEST-STAFF', $2, 'No discrepancy test') AS result;`,
      [taskId2, expectedQty]
    );
    const res2 = submitMatchRes.rows[0].result;
    console.log('Result:', res2);

    if (!res2.success || res2.has_discrepancy || res2.approval_id) {
      throw new Error('Test Case 2 failed: Expected success with no discrepancy and no approval_id');
    }

    const task2 = (await client.query('SELECT status FROM public.warehouse_tasks WHERE id = $1;', [taskId2])).rows[0];
    if (task2.status !== 'done') {
      throw new Error('Task 2 should be set to done');
    }
    await client.query('ROLLBACK;');
    console.log('Test Case 2 completed successfully and rolled back.');

    // --- TEST CASE 3: SUBMIT DISCREPANCY & REJECT ---
    console.log(`--- Test Case 3: Submit discrepancy (${expectedQty - 5} units) and reject it ---`);
    await client.query('BEGIN;');
    const taskInsertRes3 = await client.query(
      `INSERT INTO public.warehouse_tasks (
        branch_id, task_type, status, meta
      ) VALUES ($1, 'count', 'pending', $2) RETURNING id;`,
      [branchId, JSON.stringify(taskMeta)]
    );
    const taskId3 = taskInsertRes3.rows[0].id;

    const submitDiscrepancyRes3 = await client.query(
      `SELECT public.submit_warehouse_count_task($1, 'TEST-STAFF', $2, 'Discrepancy test to reject') AS result;`,
      [taskId3, expectedQty - 5.0]
    );
    const res3 = submitDiscrepancyRes3.rows[0].result;
    console.log('Result:', res3);

    const approvalId3 = res3.approval_id;
    const rejectRes = await client.query(
      `SELECT public.reject_warehouse_count_approval($1, 'TEST-MANAGER') AS result;`,
      [approvalId3]
    );
    console.log('Reject RPC Result:', rejectRes.rows[0].result);

    const rejectedRecord = (await client.query('SELECT * FROM public.warehouse_count_approvals WHERE id = $1;', [approvalId3])).rows[0];
    if (rejectedRecord.status !== 'rejected') {
      throw new Error('Record status should be rejected');
    }
    if (rejectedRecord.inventory_movement_id) {
      throw new Error('Rejected count should not post inventory movement');
    }
    await client.query('ROLLBACK;');
    console.log('Test Case 3 completed successfully and rolled back.');

    console.log('All test cases passed successfully!');

  } catch (err) {
    console.error('Test execution failed:', err);
    try {
      await client.query('ROLLBACK;');
      console.log('Transaction rolled back.');
    } catch (e) {
      // ignore
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
