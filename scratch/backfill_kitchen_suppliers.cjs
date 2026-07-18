const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway',
  ssl: { rejectUnauthorized: false }
});

function getUretimNodes(nodes) {
  if (!Array.isArray(nodes)) return []
  const list = []
  for (const n of nodes) {
    if (n.type === 'uretim') {
      list.push(n)
    }
    if (n.children && n.children.length) {
      list.push(...getUretimNodes(n.children))
    }
  }
  return list
}

async function main() {
  try {
    console.log('Connecting to database...');
    const res = await pool.query("SELECT value FROM public.settings WHERE key = 'company_tree';");
    if (res.rows.length === 0) {
      console.log('No company_tree found.');
      return;
    }
    
    const tree = res.rows[0].value;
    const uretimNodes = getUretimNodes(tree);
    console.log(`Found ${uretimNodes.length} uretim nodes in tree.`);

    for (const node of uretimNodes) {
      const syncKey = `uretim_${node.id}`;
      console.log(`Upserting supplier for node: ${node.name} (${node.id})`);
      await pool.query(`
        INSERT INTO public.suppliers (
          name, supplier_kind, source_workspace_scope, source_branch_id, is_system_generated, sync_key, active, deleted_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, null
        ) ON CONFLICT (sync_key) DO UPDATE SET
          name = EXCLUDED.name,
          active = EXCLUDED.active,
          deleted_at = null;
      `, [node.name, 'internal_kitchen', 'uretim', node.id, true, syncKey, true]);
    }
    console.log('Backfill successfully completed!');
  } catch (err) {
    console.error('Backfill failed:', err);
  } finally {
    await pool.end();
  }
}

main();
