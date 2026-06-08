// WARNING: This is a live database verification script that performs real CRUD operations on the target database.
// Ensure DATABASE_URL is set in your environment before running this script.
import pg from 'pg';
const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Error: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

// Helper matching getAnaDepoNodes in Company (1).jsx
function getAnaDepoNodes(nodes) {
  if (!Array.isArray(nodes)) return []
  const list = []
  for (const n of nodes) {
    if (n.type === 'anadepo') {
      list.push(n)
    }
    if (n.children && n.children.length) {
      list.push(...getAnaDepoNodes(n.children))
    }
  }
  return list
}

async function runTest() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB.');

    // 1. Fetch current tree
    const settingsRes = await client.query("SELECT value FROM public.settings WHERE key = 'company_tree'");
    if (settingsRes.rows.length === 0) {
      console.log('No company_tree setting found. Creating empty tree.');
      await client.query("INSERT INTO public.settings (key, value) VALUES ('company_tree', '[]'::jsonb)");
    }
    const originalTree = settingsRes.rows[0]?.value || [];
    console.log(`Original tree loaded. Nodes count: ${originalTree.length}`);

    // 2. Define a test node
    const testNodeId = 'test_anadepo_node_id_123';
    const testNode = {
      id: testNodeId,
      name: 'Test Istanbul Depo',
      type: 'anadepo',
      children: []
    };

    // 3. Add to tree and save
    const tempTree = JSON.parse(JSON.stringify(originalTree));
    tempTree.push(testNode);
    console.log('Added test anadepo node to tree.');

    // 4. Run Sync logic (Simulating saveTree)
    const anadepoNodes = getAnaDepoNodes(tempTree);
    const activeSyncKeys = anadepoNodes.map(n => `anadepo_${n.id}`);
    console.log(`Active sync keys in temp tree: ${activeSyncKeys.join(', ')}`);

    for (const node of anadepoNodes) {
      const syncKey = `anadepo_${node.id}`;
      const query = `
        INSERT INTO public.suppliers (name, supplier_kind, source_workspace_scope, source_branch_id, is_system_generated, sync_key, active, deleted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (sync_key) 
        DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active, deleted_at = EXCLUDED.deleted_at
        RETURNING *;
      `;
      const values = [node.name, 'internal_warehouse', 'anadepo', testNodeId === node.id ? null : node.id, true, syncKey, true, null];
      const res = await client.query(query, values);
      console.log(`Upserted supplier: ${res.rows[0].name} (sync_key: ${res.rows[0].sync_key})`);
    }

    // 5. Verify supplier exists in DB
    const checkRes = await client.query("SELECT * FROM public.suppliers WHERE sync_key = $1", [`anadepo_${testNodeId}`]);
    if (checkRes.rows.length > 0 && checkRes.rows[0].name === 'Test Istanbul Depo' && checkRes.rows[0].active === true) {
      console.log('✅ STEP 1 PASS: Supplier created successfully and is active.');
    } else {
      throw new Error('❌ STEP 1 FAIL: Supplier not found or name/active is wrong.');
    }

    // 6. Simulate name change
    const updatedNameTree = JSON.parse(JSON.stringify(tempTree));
    const targetNode = updatedNameTree.find(n => n.id === testNodeId);
    if (targetNode) targetNode.name = 'Test Istanbul Depo (Guncel)';
    
    // Run Sync again
    for (const node of getAnaDepoNodes(updatedNameTree)) {
      const syncKey = `anadepo_${node.id}`;
      const query = `
        INSERT INTO public.suppliers (name, supplier_kind, source_workspace_scope, source_branch_id, is_system_generated, sync_key, active, deleted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (sync_key) 
        DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active, deleted_at = EXCLUDED.deleted_at
        RETURNING *;
      `;
      const values = [node.name, 'internal_warehouse', 'anadepo', null, true, syncKey, true, null];
      const res = await client.query(query, values);
      console.log(`Upserted supplier after rename: ${res.rows[0].name}`);
    }

    // Verify name updated
    const checkRenameRes = await client.query("SELECT * FROM public.suppliers WHERE sync_key = $1", [`anadepo_${testNodeId}`]);
    if (checkRenameRes.rows.length > 0 && checkRenameRes.rows[0].name === 'Test Istanbul Depo (Guncel)') {
      console.log('✅ STEP 2 PASS: Supplier name updated successfully.');
    } else {
      throw new Error('❌ STEP 2 FAIL: Supplier name rename failed.');
    }

    // 7. Simulate deletion
    const deletedTree = JSON.parse(JSON.stringify(originalTree)); // back to original without testNode
    const deletedSyncKeys = getAnaDepoNodes(deletedTree).map(n => `anadepo_${n.id}`);

    // Deactivate nodes not in tree
    const existingSuppliersRes = await client.query(
      "SELECT id, sync_key FROM public.suppliers WHERE supplier_kind = 'internal_warehouse' AND is_system_generated = true"
    );
    for (const s of existingSuppliersRes.rows) {
      if (s.sync_key && !deletedSyncKeys.includes(s.sync_key)) {
        await client.query(
          "UPDATE public.suppliers SET active = false, deleted_at = $1 WHERE id = $2",
          [new Date().toISOString(), s.id]
        );
        console.log(`Deactivated supplier ID ${s.id} (sync_key: ${s.sync_key})`);
      }
    }

    // Verify deactivated
    const checkDeactivatedRes = await client.query("SELECT * FROM public.suppliers WHERE sync_key = $1", [`anadepo_${testNodeId}`]);
    if (checkDeactivatedRes.rows.length > 0 && checkDeactivatedRes.rows[0].active === false && checkDeactivatedRes.rows[0].deleted_at !== null) {
      console.log('✅ STEP 3 PASS: Supplier deactivated and soft deleted successfully.');
    } else {
      throw new Error('❌ STEP 3 FAIL: Supplier deactivation failed.');
    }

    // 8. Clean up test record from DB completely so we leave no junk
    await client.query("DELETE FROM public.suppliers WHERE sync_key = $1", [`anadepo_${testNodeId}`]);
    console.log('Test record cleaned up from database.');

  } catch (error) {
    console.error('Test execution failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTest();
