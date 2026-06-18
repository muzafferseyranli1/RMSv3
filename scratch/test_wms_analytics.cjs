const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadServerEnv() {
  const envPaths = [
    path.join(__dirname, '../server/.env'),
    path.join(__dirname, '.env'),
    'X:/RMSv3/server/.env'
  ]
  
  let found = false
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const separatorIndex = line.indexOf('=')
        if (separatorIndex === -1) continue

        const key = line.slice(0, separatorIndex).trim()
        if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue

        let value = line.slice(separatorIndex + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        process.env[key] = value
      }
      found = true
      break
    }
  }
}
loadServerEnv()

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is missing.")
  process.exit(1)
}

async function runTest() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('Connected to DB for WMS Analytics Smoke Test.')

  try {
    await client.query('BEGIN')

    // 1. Fetch an existing warehouse branch
    const { rows: branches } = await client.query("SELECT id, name FROM public.company_nodes WHERE type = 'anadepo' LIMIT 1")
    if (branches.length === 0) {
      console.log('No warehouse branches found in DB. Skipping test.')
      return
    }
    const branch = branches[0]
    console.log(`Using branch: ${branch.name} (${branch.id})`)

    // 2. Create a mock task and log an event (tests log-event SQL path)
    const { rows: taskRows } = await client.query(`
      INSERT INTO public.warehouse_tasks (branch_id, task_type, status, description, meta)
      VALUES ($1, 'putaway', 'pending', 'Smoke test dummy task', '{"quantity": 10}')
      RETURNING id
    `, [branch.id])
    const taskId = taskRows[0].id
    console.log(`Mock warehouse task created: ${taskId}`)

    const eventPayload = JSON.stringify({ error: "Disk full", filename: "evidence_photo.jpg", app_version: "1.0" })
    await client.query(`
      INSERT INTO public.warehouse_task_events (
        task_id, event_type, personnel_id, terminal_id, payload
      ) VALUES ($1, $2, $3, $4, $5)
    `, [taskId, 'evidence_upload_failed', null, 'TERMINAL-TEST', eventPayload])
    console.log('✔ Event logged successfully into warehouse_task_events.')

    // 3. Test Dashboard metrics queries
    console.log('\n--- Testing Dashboard Queries ---')
    
    const malKabul = await client.query(`
      SELECT COUNT(*)::int as count FROM public.purchase_orders 
      WHERE branch_id = $1 AND status IN ('approved', 'submitted') AND deleted_at IS NULL
    `, [branch.id])
    console.log(`Pending Mal Kabul count: ${malKabul.rows[0].count}`)

    const putaway = await client.query(`
      SELECT COUNT(*)::int as count FROM public.warehouse_tasks 
      WHERE branch_id = $1 AND task_type = 'putaway' AND status IN ('pending', 'assigned', 'in_progress')
    `, [branch.id])
    console.log(`Open Putaway count: ${putaway.rows[0].count}`)

    const pick = await client.query(`
      SELECT COUNT(*)::int as count FROM public.warehouse_tasks 
      WHERE branch_id = $1 AND task_type = 'pick' AND status IN ('pending', 'assigned', 'in_progress')
    `, [branch.id])
    console.log(`Open Pick count: ${pick.rows[0].count}`)

    const exceptions = await client.query(`
      SELECT COUNT(*)::int as count FROM public.warehouse_tasks 
      WHERE branch_id = $1 AND status = 'exception'
    `, [branch.id])
    console.log(`Exception Tasks count: ${exceptions.rows[0].count}`)

    const failedScans = await client.query(`
      SELECT COUNT(*)::int as count FROM public.warehouse_task_events e
      JOIN public.warehouse_tasks t ON e.task_id = t.id
      WHERE t.branch_id = $1 AND e.event_type = 'scan_failed'
    `, [branch.id])
    console.log(`Failed Scans count: ${failedScans.rows[0].count}`)

    const capacityExceeded = await client.query(`
      SELECT COUNT(*)::int as count FROM (
         SELECT public.get_warehouse_shipment_capacity(id) as cap 
         FROM public.warehouse_shipments 
         WHERE source_branch_id = $1 AND status = 'draft' AND vehicle_id IS NOT NULL AND deleted_at IS NULL
      ) c WHERE (c.cap->>'is_exceeded')::boolean = true OR (c.cap->>'is_temperature_mismatched')::boolean = true
    `, [branch.id])
    console.log(`Capacity Exceeded shipments count: ${capacityExceeded.rows[0].count}`)

    const missingPkg = await client.query(`
      SELECT COUNT(*)::int as count FROM public.stock_items 
      WHERE deleted_at IS NULL AND id NOT IN (
        SELECT stock_item_id FROM public.stock_item_package_units 
        WHERE active = true AND length_cm > 0 AND width_cm > 0 AND height_cm > 0 AND gross_weight_kg > 0
      )
    `)
    console.log(`Missing package dimensions count: ${missingPkg.rows[0].count}`)

    const missingVehicles = await client.query(`
      SELECT COUNT(*)::int as count FROM public.vehicles 
      WHERE (max_volume_m3 IS NULL OR max_volume_m3 = 0 OR max_weight_kg IS NULL OR max_weight_kg = 0) 
        AND active = true AND branch_id = $1
    `, [branch.id])
    console.log(`Missing capacity vehicles count: ${missingVehicles.rows[0].count}`)

    // 4. Test Report metrics queries
    console.log('\n--- Testing Reports Queries ---')

    const availableStock = await client.query(`SELECT COALESCE(SUM(pickable_qty), 0)::numeric as qty FROM public.v_wms_pickable_stock WHERE branch_id = $1`, [branch.id])
    console.log(`Available stock qty: ${availableStock.rows[0].qty}`)

    const totalLocations = await client.query(`SELECT COUNT(*)::int as total FROM public.warehouse_locations WHERE branch_id = $1 AND is_active = true`, [branch.id])
    const occupiedLocations = await client.query(`SELECT COUNT(DISTINCT location_id)::int as occupied FROM public.v_wms_pickable_stock WHERE branch_id = $1 AND pickable_qty > 0`, [branch.id])
    console.log(`Locations occupancy: ${occupiedLocations.rows[0].occupied}/${totalLocations.rows[0].total}`)

    const expiryRes = await client.query(`
      SELECT 
        v.stock_item_id,
        si.name AS product_name,
        si.sku AS product_sku,
        v.location_id,
        v.lpn_id,
        v.lot_number,
        v.expiration_date,
        v.pickable_qty::numeric,
        (v.expiration_date - CURRENT_DATE) as days_to_expiry
       FROM public.v_wms_pickable_stock v
       JOIN public.stock_items si ON v.stock_item_id = si.id
       WHERE v.branch_id = $1 AND v.expiration_date IS NOT NULL AND v.pickable_qty > 0
       ORDER BY v.expiration_date ASC
       LIMIT 5
     `, [branch.id])
    console.log(`Expiry approaching items found: ${expiryRes.rows.length}`)

    const performanceRes = await client.query(`
      SELECT 
        COALESCE(t.meta->>'completed_by', t.assigned_personnel_id, 'Bilinmeyen Personel') AS personnel,
        t.task_type,
        COUNT(*)::int AS completed_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)))::numeric / 60, 2)::float AS avg_duration_minutes
       FROM public.warehouse_tasks t
       WHERE t.branch_id = $1 AND t.status = 'done' AND t.completed_at IS NOT NULL
       GROUP BY COALESCE(t.meta->>'completed_by', t.assigned_personnel_id, 'Bilinmeyen Personel'), t.task_type
       ORDER BY completed_count DESC
    `, [branch.id])
    console.log(`Personnel performance rows: ${performanceRes.rows.length}`)

    // 5. Test LPN Details queries
    console.log('\n--- Testing LPN Detail Queries ---')
    // Create a mock LPN
    const { rows: lpnRows } = await client.query(`
      INSERT INTO public.warehouse_lpns (lpn_code, status, branch_id)
      VALUES ('LPN-SMOKE-TEST', 'empty', $1)
      RETURNING id
    `, [branch.id])
    const lpnId = lpnRows[0].id
    console.log(`Mock LPN created: ${lpnId}`)

    const lpnDetails = await client.query(`
      SELECT id, lpn_code, status, location_id FROM public.warehouse_lpns 
      WHERE branch_id = $1 AND lpn_code = $2 LIMIT 1
    `, [branch.id, 'LPN-SMOKE-TEST'])
    console.log(`LPN code trace: ${lpnDetails.rows[0]?.lpn_code || 'Not found'}`)

    const lpnHistory = await client.query(`
      SELECT im.id, im.movement_at, im.direction, im.quantity::numeric, im.movement_type, 
             si.name AS product_name, si.sku AS product_sku
      FROM public.inventory_movements im 
      JOIN public.stock_items si ON im.stock_item_id = si.id 
      WHERE im.lpn_id = $1 AND im.deleted_at IS NULL AND im.is_cancelled = false
      ORDER BY im.movement_at DESC
    `, [lpnId])
    console.log(`LPN movement history rows count: ${lpnHistory.rows.length}`)

    // 6. Test Task events list
    console.log('\n--- Testing Task Events List ---')
    const taskEvents = await client.query(`
      SELECT 
        e.id,
        e.event_type,
        e.terminal_id,
        e.created_at,
        t.task_type
       FROM public.warehouse_task_events e
       JOIN public.warehouse_tasks t ON e.task_id = t.id
       WHERE t.branch_id = $1
       ORDER BY e.created_at DESC
       LIMIT 5
    `, [branch.id])
    console.log(`Task events retrieved: ${taskEvents.rows.length}`)

    console.log('\n✔ All queries verified successfully without any database errors!')

    // Cleanup
    console.log('Rolling back transaction to keep DB clean...')
    await client.query('ROLLBACK')
    console.log('All mock test records rolled back successfully.')
    console.log('WMS Analytics Smoke Test passed successfully!')

  } catch (err) {
    console.error('Smoke Test Failed:', err)
    try {
      await client.query('ROLLBACK')
    } catch (e) {}
    process.exit(1)
  } finally {
    await client.end()
  }
}

runTest().catch(err => { console.error(err); process.exit(1) })

