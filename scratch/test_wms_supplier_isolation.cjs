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
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}

const API_URL = 'http://localhost:3001';

async function sendQueryRequest(body) {
  const response = await fetch(`${API_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const status = response.status;
  let json = null;
  try {
    json = await response.json();
  } catch (e) {
    // ignore
  }
  return { status, json };
}

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  let mockExternalSupplierId, mockInternalSupplierId;
  let po1Id, po2Id, po3Id;

  try {
    await client.connect();
    console.log('Connected to database.');

    // Pre-cleanup in case of previous failed runs
    await client.query("DELETE FROM public.purchase_orders WHERE order_no IN ('PO_MOCK_1', 'PO_MOCK_2', 'PO_MOCK_3');");
    await client.query("DELETE FROM public.suppliers WHERE name IN ('MOCK_EXT_SUPPLIER', 'MOCK_INT_SUPPLIER');");

    // 1. Get an existing branch node
    const branchRes = await client.query("SELECT id FROM public.company_nodes LIMIT 1;");
    if (branchRes.rows.length === 0) {
      console.log('No company node/branch found. Skipping test.');
      return;
    }
    const branchId = branchRes.rows[0].id;

    // 2. Insert mock suppliers
    const s1Res = await client.query(`
      INSERT INTO public.suppliers (name, supplier_kind, active)
      VALUES ('MOCK_EXT_SUPPLIER', 'external', true) RETURNING id;
    `);
    mockExternalSupplierId = s1Res.rows[0].id;

    const s2Res = await client.query(`
      INSERT INTO public.suppliers (name, supplier_kind, active)
      VALUES ('MOCK_INT_SUPPLIER', 'internal_warehouse', true) RETURNING id;
    `);
    mockInternalSupplierId = s2Res.rows[0].id;

    console.log(`Mock suppliers created: Ext=${mockExternalSupplierId}, Int=${mockInternalSupplierId}`);

    // 3. Insert mock purchase orders
    // PO1: Replenishment (flow_channel: warehouse_replenishment, supplier: external)
    const po1Res = await client.query(`
      INSERT INTO public.purchase_orders (order_no, branch_id, supplier_id, flow_channel, status, meta)
      VALUES ('PO_MOCK_1', $1, $2, 'warehouse_replenishment', 'submitted', '{}') RETURNING id;
    `, [branchId, mockExternalSupplierId]);
    po1Id = po1Res.rows[0].id;

    // PO2: External purchase, but linked to internal warehouse supplier
    const po2Res = await client.query(`
      INSERT INTO public.purchase_orders (order_no, branch_id, supplier_id, flow_channel, status, meta)
      VALUES ('PO_MOCK_2', $1, $2, 'external_purchase', 'submitted', '{}') RETURNING id;
    `, [branchId, mockInternalSupplierId]);
    po2Id = po2Res.rows[0].id;

    // PO3: Normal external purchase (flow_channel: external_purchase, supplier: external)
    const po3Res = await client.query(`
      INSERT INTO public.purchase_orders (order_no, branch_id, supplier_id, flow_channel, status, meta)
      VALUES ('PO_MOCK_3', $1, $2, 'external_purchase', 'submitted', '{}') RETURNING id;
    `, [branchId, mockExternalSupplierId]);
    po3Id = po3Res.rows[0].id;

    console.log(`Mock purchase orders created: PO1=${po1Id}, PO2=${po2Id}, PO3=${po3Id}`);

    // --- TEST CASE 1: Attempt to dispatch mark WMS Replenishment (PO1) ---
    console.log('\n--- Test Case 1: Dispatch mark on WMS replenishment order (PO1) ---');
    const tc1 = await sendQueryRequest({
      table: 'purchase_orders',
      operation: 'update',
      data: { meta: { supplier_marked_sent: true, supplier_sent_at: new Date().toISOString() } },
      filters: [{ type: 'eq', col: 'id', val: po1Id }]
    });
    console.log('HTTP Status:', tc1.status);
    console.log('Response:', tc1.json);
    if (!tc1.json?.error?.message?.includes('Depo ikmal siparişleri')) {
      throw new Error('Test Case 1 failed: Replenishment dispatch mark should have been rejected');
    }
    console.log('✔ Test Case 1 passed (Blocked successfully).');

    // --- TEST CASE 2: Attempt to dispatch mark PO2 (linked to internal warehouse supplier) ---
    console.log('\n--- Test Case 2: Dispatch mark on order with internal supplier (PO2) ---');
    const tc2 = await sendQueryRequest({
      table: 'purchase_orders',
      operation: 'update',
      data: { meta: { supplier_marked_sent: true, supplier_sent_at: new Date().toISOString() } },
      filters: [{ type: 'eq', col: 'id', val: po2Id }]
    });
    console.log('HTTP Status:', tc2.status);
    console.log('Response:', tc2.json);
    if (!tc2.json?.error?.message?.includes('Depo ikmal siparişleri')) {
      throw new Error('Test Case 2 failed: Internal supplier dispatch mark should have been rejected');
    }
    console.log('✔ Test Case 2 passed (Blocked successfully).');

    // --- TEST CASE 3: Attempt to dispatch mark PO3 (External purchase, external supplier) ---
    console.log('\n--- Test Case 3: Dispatch mark on external order (PO3) ---');
    const tc3 = await sendQueryRequest({
      table: 'purchase_orders',
      operation: 'update',
      data: { meta: { supplier_marked_sent: true, supplier_sent_at: new Date().toISOString() } },
      filters: [{ type: 'eq', col: 'id', val: po3Id }]
    });
    console.log('HTTP Status:', tc3.status);
    console.log('Response:', tc3.json);
    if (tc3.status !== 200 || tc3.json?.error) {
      throw new Error('Test Case 3 failed: External purchase dispatch mark should have succeeded with 200 OK');
    }
    console.log('✔ Test Case 3 passed (Allowed successfully).');

    // --- TEST CASE 4: Add note on WMS Replenishment (PO1) ---
    console.log('\n--- Test Case 4: Add note on WMS replenishment order (PO1) ---');
    const tc4 = await sendQueryRequest({
      table: 'purchase_orders',
      operation: 'update',
      data: { meta: { supplier_notes: [{ id: '1', text: 'hello' }] } },
      filters: [{ type: 'eq', col: 'id', val: po1Id }]
    });
    console.log('HTTP Status:', tc4.status);
    console.log('Response:', tc4.json);
    if (!tc4.json?.error?.message?.includes('Depo ikmal siparişleri')) {
      throw new Error('Test Case 4 failed: Adding note to replenishment should have been rejected');
    }
    console.log('✔ Test Case 4 passed (Blocked successfully).');

    // --- TEST CASE 5: Confirm WMS flow direct SQL update (WMS flow check) ---
    console.log('\n--- Test Case 5: WMS flow direct database update (WMS bypass test) ---');
    // Direct DB updates representing internal system functions (like confirm_warehouse_shipment) should be allowed
    const dbUpdateRes = await client.query(`
      UPDATE public.purchase_orders
      SET meta = jsonb_build_object('supplier_marked_sent', true)
      WHERE id = $1 RETURNING status, meta;
    `, [po1Id]);
    console.log('Updated PO1 directly in DB:', dbUpdateRes.rows[0]);
    if (!dbUpdateRes.rows[0]?.meta?.supplier_marked_sent) {
      throw new Error('Test Case 5 failed: Database-level update should bypass API query guards');
    }
    console.log('✔ Test Case 5 passed (Bypassed database-level successfully).');

    console.log('\nAll isolation test cases passed successfully!');

  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    // Cleanup mock data
    console.log('\nCleaning up mock data...');
    if (po1Id || po2Id || po3Id) {
      const ids = [po1Id, po2Id, po3Id].filter(Boolean);
      await client.query(`DELETE FROM public.purchase_orders WHERE id = ANY($1);`, [ids]);
    }
    if (mockExternalSupplierId || mockInternalSupplierId) {
      const ids = [mockExternalSupplierId, mockInternalSupplierId].filter(Boolean);
      await client.query(`DELETE FROM public.suppliers WHERE id = ANY($1);`, [ids]);
    }
    await client.end();
    console.log('Database connection closed.');
  }
}

main();
