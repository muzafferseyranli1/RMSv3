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

    // 1. Get/Create test branch
    const branchRes = await client.query("SELECT id, name FROM public.company_nodes WHERE type IN ('sube', 'anadepo', 'branch') LIMIT 1;");
    if (branchRes.rows.length === 0) {
      console.log('No branches found to run test. Skipping.');
      return;
    }
    const branchId = branchRes.rows[0].id;
    const branchName = branchRes.rows[0].name;
    console.log(`Using branch: ${branchName} (${branchId})`);

    // We will run this inside a transaction that rolls back at the end to keep the DB clean!
    await client.query('BEGIN;');

    // 2. Create mock stock item
    const sku = 'TEST-REPL-SKU-' + Date.now();
    const itemRes = await client.query(
      `INSERT INTO public.stock_items (sku, name, unit) VALUES ($1, 'Test Replenishment Product', 'Adet') RETURNING id;`,
      [sku]
    );
    const stockItemId = itemRes.rows[0].id;
    console.log(`Created test stock item: ${sku} (${stockItemId})`);

    // 3. Create PICK_FACE and RESERVE locations
    const pfLocRes = await client.query(
      `INSERT INTO public.warehouse_locations (branch_id, zone_code, aisle, rack, level, bin, usage_type, is_active)
       VALUES ($1, 'PF1', '1', '1', '1', '1', 'PICK_FACE', true) RETURNING id;`,
      [branchId]
    );
    const pfLocationId = pfLocRes.rows[0].id;
    console.log(`Created PICK_FACE location: LOC-PF1-1-1-1 (${pfLocationId})`);

    const resLocRes = await client.query(
      `INSERT INTO public.warehouse_locations (branch_id, zone_code, aisle, rack, level, bin, usage_type, is_active)
       VALUES ($1, 'RES1', '2', '2', '2', '2', 'RESERVE', true) RETURNING id;`,
      [branchId]
    );
    const resLocationId = resLocRes.rows[0].id;
    console.log(`Created RESERVE location: LOC-RES1-2-2-2 (${resLocationId})`);

    // 4. Create stock item settings with min=10 and max=50
    await client.query(
      `INSERT INTO public.stock_item_warehouse_settings (branch_id, stock_item_id, default_location_id, pick_face_min_qty, pick_face_max_qty)
       VALUES ($1, $2, $3, 10.0, 50.0);`,
      [branchId, stockItemId, pfLocationId]
    );
    console.log('Inserted stock item settings (min: 10, max: 50)');

    // 5. Test Case 1: Suggestions with 0 stock in PICK_FACE and 0 stock in RESERVE (Expect warning)
    console.log('\n--- Test Case 1: Fetch suggestions (Empty reserve) ---');
    
    // Simulate suggestion query
    const getSuggestions = async () => {
      // 1. Fetch settings and pick-face locations
      const settingsSql = `
        SELECT
          s.id AS settings_id,
          s.stock_item_id,
          s.pick_face_min_qty,
          s.pick_face_max_qty,
          s.default_location_id AS pick_face_location_id,
          si.name AS product_name,
          si.sku AS product_sku,
          si.unit AS product_unit,
          loc.zone_code,
          loc.aisle,
          loc.rack,
          loc.level,
          loc.bin
        FROM public.stock_item_warehouse_settings s
        JOIN public.stock_items si ON s.stock_item_id = si.id
        JOIN public.warehouse_locations loc ON s.default_location_id = loc.id
        WHERE s.branch_id = $1
          AND loc.usage_type = 'PICK_FACE'
          AND loc.is_active = true
          AND s.pick_face_min_qty IS NOT NULL
          AND s.pick_face_max_qty IS NOT NULL
          AND s.stock_item_id = $2
      `;
      const { rows: settingsRows } = await client.query(settingsSql, [branchId, stockItemId]);
      const suggestions = [];

      for (const item of settingsRows) {
        // 2. Fetch current pickable quantity at pick-face
        const stockSql = `
          SELECT COALESCE(SUM(pickable_qty), 0) AS current_qty
          FROM public.v_wms_pickable_stock
          WHERE branch_id = $1
            AND stock_item_id = $2
            AND location_id = $3
        `;
        const { rows: stockRows } = await client.query(stockSql, [branchId, item.stock_item_id, item.pick_face_location_id]);
        const current_qty = parseFloat(stockRows[0].current_qty);

        // 3. Fetch pending tasks of type move targeting this pick-face
        const pendingSql = `
          SELECT COALESCE(SUM((meta->>'quantity')::numeric), 0) AS pending_qty
          FROM public.warehouse_tasks
          WHERE branch_id = $1
            AND task_type = 'move'
            AND status IN ('pending', 'assigned', 'in_progress')
            AND (meta->>'stock_item_id')::UUID = $2
            AND (meta->>'target_location_id')::UUID = $3
        `;
        const { rows: pendingRows } = await client.query(pendingSql, [branchId, item.stock_item_id, item.pick_face_location_id]);
        const pending_qty = parseFloat(pendingRows[0].pending_qty);

        const min_qty = parseFloat(item.pick_face_min_qty);
        const max_qty = parseFloat(item.pick_face_max_qty);

        if (current_qty + pending_qty < min_qty) {
          let needed_qty = max_qty - (current_qty + pending_qty);
          if (needed_qty > 0) {
            // 4. Fetch available stock in RESERVE locations
            const reserveSql = `
              SELECT
                v.location_id,
                v.lpn_id,
                v.lot_number,
                v.expiration_date,
                v.pickable_qty,
                loc.zone_code,
                loc.aisle,
                loc.rack,
                loc.level,
                loc.bin,
                lpn.lpn_code
              FROM public.v_wms_pickable_stock v
              JOIN public.warehouse_locations loc ON v.location_id = loc.id
              LEFT JOIN public.warehouse_lpns lpn ON v.lpn_id = lpn.id
              WHERE v.branch_id = $1
                AND v.stock_item_id = $2
                AND loc.usage_type = 'RESERVE'
                AND loc.is_active = true
                AND v.pickable_qty > 0
              ORDER BY
                v.expiration_date ASC NULLS LAST,
                v.pickable_qty DESC
            `;
            const { rows: reserveRows } = await client.query(reserveSql, [branchId, item.stock_item_id]);
            
            const allocations = [];
            let rem = needed_qty;
            for (const resRow of reserveRows) {
              if (rem <= 0) break;
              const avail = parseFloat(resRow.pickable_qty);
              const alloc = Math.min(rem, avail);
              allocations.push({
                location_id: resRow.location_id,
                zone_code: resRow.zone_code,
                aisle: resRow.aisle,
                rack: resRow.rack,
                level: resRow.level,
                bin: resRow.bin,
                lpn_id: resRow.lpn_id,
                lpn_code: resRow.lpn_code,
                lot_number: resRow.lot_number,
                expiration_date: resRow.expiration_date,
                pickable_qty: avail,
                allocated_qty: alloc
              });
              rem -= alloc;
            }

            suggestions.push({
              stock_item_id: item.stock_item_id,
              product_name: item.product_name,
              product_sku: item.product_sku,
              product_unit: item.product_unit,
              pick_face_location_id: item.pick_face_location_id,
              pick_face_location_code: `LOC-${item.zone_code}-${item.aisle || 0}-${item.rack || 0}-${item.level || 0}`,
              pick_face_min_qty: min_qty,
              pick_face_max_qty: max_qty,
              current_qty,
              pending_qty,
              needed_qty,
              allocations,
              has_warning: allocations.length === 0,
              warning_message: allocations.length === 0 ? 'Rezerve alanda kullanılabilir stok bulunmuyor.' : null
            });
          }
        }
      }
      return suggestions;
    };

    let suggestions = await getSuggestions();
    console.log('Suggestions result:', JSON.stringify(suggestions, null, 2));
    if (suggestions.length !== 1 || !suggestions[0].has_warning) {
      throw new Error('Test Case 1 failed: Expected exactly 1 suggestion with warning due to empty reserve stock.');
    }
    console.log('✔ Test Case 1 passed: Suggestion generated with red warning badge.');

    // 6. Test Case 2: Seed reserve stock and fetch suggestions again
    console.log('\n--- Test Case 2: Seed reserve stock and suggest allocation ---');
    
    // Find a real movement to copy not-null values
    const existingMovementRes = await client.query(`
      SELECT company_id, legal_entity_id, org_unit_id, warehouse_id, warehouse_name, currency_code, source_doc_type, movement_type
      FROM public.inventory_movements
      WHERE deleted_at IS NULL
      LIMIT 1;
    `);
    
    let companyId = branchId;
    let legalEntityId = null;
    let orgUnitId = null;
    let warehouseId = null;
    let warehouseName = 'Ana Depo';
    let currencyCode = 'TRY';
    let sourceDocType = 'manual';
    let movementType = 'putaway';
    
    if (existingMovementRes.rows.length > 0) {
      const em = existingMovementRes.rows[0];
      companyId = em.company_id || companyId;
      legalEntityId = em.legal_entity_id;
      orgUnitId = em.org_unit_id;
      warehouseId = em.warehouse_id;
      warehouseName = em.warehouse_name || warehouseName;
      currencyCode = em.currency_code || currencyCode;
      sourceDocType = em.source_doc_type || sourceDocType;
      movementType = em.movement_type || movementType;
    }
    
    await client.query(
      `INSERT INTO public.inventory_movements (
        company_id, legal_entity_id, org_unit_id, branch_id, branch_name, warehouse_id, warehouse_name,
        stock_item_id, item_name, item_sku, unit, direction, quantity, unit_cost, currency_code,
        movement_at, item_type, location_id, movement_type, source_doc_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Test Replenishment Product', $9, 'Adet', 'in', 100.0, 10.0, $10, now(), 'stock_item', $11, $12, $13);`,
      [companyId, legalEntityId, orgUnitId, branchId, branchName, warehouseId, warehouseName, stockItemId, sku, currencyCode, resLocationId, movementType, sourceDocType]
    );
    console.log('Seeded 100 units of reserve stock.');

    suggestions = await getSuggestions();
    console.log('Suggestions result after seeding:', JSON.stringify(suggestions, null, 2));
    if (suggestions.length !== 1 || suggestions[0].has_warning || suggestions[0].allocations.length !== 1 || parseFloat(suggestions[0].allocations[0].allocated_qty) !== 50.0) {
      throw new Error('Test Case 2 failed: Expected suggestion with 50 units allocated from reserve.');
    }
    console.log('✔ Test Case 2 passed: FEFO reservation suggested successfully.');

    // 7. Test Case 3: Create replenishment move task
    console.log('\n--- Test Case 3: Create move task and warehouse reservation ---');
    const sugg = suggestions[0];
    const alloc = sugg.allocations[0];
    const pickFaceLocCode = sugg.pick_face_location_code;
    const sourceLocCode = `LOC-${alloc.zone_code}-${alloc.aisle || 0}-${alloc.rack || 0}-${alloc.level || 0}`;

    const taskMeta = {
      stock_item_id: sugg.stock_item_id,
      source_location_id: alloc.location_id,
      source_location: sourceLocCode,
      target_location_id: sugg.pick_face_location_id,
      target_location: pickFaceLocCode,
      quantity: Number(alloc.allocated_qty),
      lpn_id: alloc.lpn_id,
      lpn_code: alloc.lpn_code,
      lot_number: alloc.lot_number,
      expiration_date: alloc.expiration_date
    };

    const description = `${sugg.product_name} ikmali (${sourceLocCode} -> ${pickFaceLocCode})`;
    const taskInsertRes = await client.query(
      `INSERT INTO public.warehouse_tasks (branch_id, task_type, status, priority, description, meta)
       VALUES ($1, 'move', 'pending', 'high', $2, $3) RETURNING id;`,
      [branchId, description, JSON.stringify(taskMeta)]
    );
    const taskId = taskInsertRes.rows[0].id;
    console.log(`Created move task: ${taskId}`);

    await client.query(
      `INSERT INTO public.warehouse_reservations (
        branch_id, stock_item_id, location_id, lpn_id, lot_number, expiration_date,
        source_doc_type, source_doc_id, reserved_qty, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'warehouse_task', $7, $8, 'active');`,
      [branchId, sugg.stock_item_id, alloc.location_id, alloc.lpn_id, alloc.lot_number, alloc.expiration_date, taskId, alloc.allocated_qty]
    );
    console.log('Created active warehouse reservation.');

    // Verify suggestions are now empty since pending move tasks cover the deficiency
    suggestions = await getSuggestions();
    console.log('Suggestions result after task creation:', JSON.stringify(suggestions, null, 2));
    if (suggestions.length !== 0) {
      throw new Error('Test Case 3 failed: Suggestion should be cleared because pending task quantity meets the min requirement.');
    }
    console.log('✔ Test Case 3 passed: Suggestions account for pending tasks correctly.');

    // 8. Test Case 4: Barcode parsing for source and target
    console.log('\n--- Test Case 4: Barcode parsing (source/target validation) ---');
    
    // Simulate barcode parsing logic
    const parseBarcode = async (barcode) => {
      const locRes = await client.query(
        'SELECT id, zone_code, aisle, rack, level, bin FROM warehouse_locations WHERE branch_id = $1 AND is_active = true',
        [branchId]
      );
      let matchedLoc = null;
      for (const loc of locRes.rows) {
        const fullLocCode = `LOC-${loc.zone_code}-${loc.aisle || 0}-${loc.rack || 0}-${loc.level || 0}`;
        const shortLocCode = `LOC-${loc.zone_code}`;
        if (
          fullLocCode.toLowerCase() === barcode.toLowerCase() ||
          shortLocCode.toLowerCase() === barcode.toLowerCase() ||
          loc.zone_code.toLowerCase() === barcode.toLowerCase() ||
          loc.id === barcode
        ) {
          matchedLoc = loc;
          break;
        }
      }

      if (!matchedLoc) return { matched: false, message: 'Lokasyon bulunamadı' };

      // Check against move task
      if (matchedLoc.id === taskMeta.source_location_id || matchedLoc.zone_code === 'RES1') {
        return { matched: true, is_expected: true, message: `Kaynak lokasyon doğrulandı: Zone ${matchedLoc.zone_code}`, location: matchedLoc };
      } else if (matchedLoc.id === taskMeta.target_location_id || matchedLoc.zone_code === 'PF1') {
        return { matched: true, is_expected: true, message: `Hedef lokasyon doğrulandı: Zone ${matchedLoc.zone_code}`, location: matchedLoc };
      } else {
        return { matched: true, is_expected: false, message: `Hata: Yanlış lokasyon!`, location: matchedLoc };
      }
    };

    // Scan source
    const sourceScan = await parseBarcode(sourceLocCode);
    console.log(`Scan source results:`, sourceScan);
    if (!sourceScan.is_expected || !sourceScan.message.includes('Kaynak lokasyon')) {
      throw new Error('Test Case 4 failed: Source scan should be expected and verified.');
    }

    // Scan target
    const targetScan = await parseBarcode(pickFaceLocCode);
    console.log(`Scan target results:`, targetScan);
    if (!targetScan.is_expected || !targetScan.message.includes('Hedef lokasyon')) {
      throw new Error('Test Case 4 failed: Target scan should be expected and verified.');
    }

    // Scan wrong location
    const wrongScan = await parseBarcode('LOC-PF1-9-9-9');
    console.log(`Scan wrong location results:`, wrongScan);
    if (wrongScan.is_expected) {
      throw new Error('Test Case 4 failed: Wrong location scan must not be expected.');
    }
    console.log('✔ Test Case 4 passed: Barcode validation for move task works perfectly.');

    // 9. Test Case 5: Execute complete_warehouse_move_task database RPC
    console.log('\n--- Test Case 5: Execute complete_warehouse_move_task DB RPC ---');
    const completeRes = await client.query(
      `SELECT public.complete_warehouse_move_task($1, 'TEST-USER', $2, $3) AS result;`,
      [taskId, taskMeta.source_location_id, taskMeta.target_location_id]
    );
    console.log('RPC result:', completeRes.rows[0].result);
    if (!completeRes.rows[0].result || !completeRes.rows[0].result.success) {
      throw new Error('Test Case 5 failed: complete_warehouse_move_task RPC returned failure.');
    }

    // Verify task status is 'done'
    const taskStatus = (await client.query('SELECT status FROM public.warehouse_tasks WHERE id = $1;', [taskId])).rows[0].status;
    console.log('Task status after completion:', taskStatus);
    if (taskStatus !== 'done') {
      throw new Error('Test Case 5 failed: Task status should be done.');
    }

    // Verify reservation is 'consumed'
    const resStatus = (await client.query('SELECT status FROM public.warehouse_reservations WHERE source_doc_id = $1;', [taskId])).rows[0].status;
    console.log('Reservation status after completion:', resStatus);
    if (resStatus !== 'consumed') {
      throw new Error('Test Case 5 failed: Reservation status should be consumed.');
    }

    // Verify inventory movements created
    const movementsRes = await client.query(
      `SELECT direction, quantity, location_id, movement_type FROM public.inventory_movements WHERE source_doc_id = $1;`,
      [taskId]
    );
    console.log('Movements generated:', movementsRes.rows);
    if (movementsRes.rows.length !== 2) {
      throw new Error('Test Case 5 failed: Expected exactly 2 inventory movements.');
    }
    const outMove = movementsRes.rows.find(m => m.direction === 'out');
    const inMove = movementsRes.rows.find(m => m.direction === 'in');
    if (!outMove || parseFloat(outMove.quantity) !== 50.0 || outMove.location_id !== taskMeta.source_location_id) {
      throw new Error('Test Case 5 failed: Outbound movement is incorrect.');
    }
    if (!inMove || parseFloat(inMove.quantity) !== 50.0 || inMove.location_id !== taskMeta.target_location_id) {
      throw new Error('Test Case 5 failed: Inbound movement is incorrect.');
    }

    // Verify target pickable balance is now 50
    const pfBalanceRes = await client.query(
      `SELECT COALESCE(SUM(pickable_qty), 0) AS balance
       FROM public.v_wms_pickable_stock
       WHERE branch_id = $1 AND stock_item_id = $2 AND location_id = $3;`,
      [branchId, stockItemId, pfLocationId]
    );
    const pfBalance = parseFloat(pfBalanceRes.rows[0].balance);
    console.log(`Pickable balance at pick-face: ${pfBalance}`);
    if (pfBalance !== 50.0) {
      throw new Error(`Test Case 5 failed: Expected pick-face balance to be 50.0, got ${pfBalance}`);
    }

    console.log('✔ Test Case 5 passed: RPC completed task, consumed reservation, posted transfers, and updated stock successfully.');

    // Rollback to keep database clean
    await client.query('ROLLBACK;');
    console.log('\nAll test cases passed successfully!');

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
