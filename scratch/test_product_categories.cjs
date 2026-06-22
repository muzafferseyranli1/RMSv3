const { Client } = require('pg');
const DATABASE_URL = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: false });
  await client.connect();

  const catRes = await client.query('SELECT id, name, parent_id FROM sale_categories WHERE deleted_at IS NULL;');
  const categories = catRes.rows;
  const catMap = new Map(categories.map(c => [c.id, c]));

  function getRootCategoryId(catId) {
    let curr = catMap.get(catId);
    if (!curr) return null;
    while (curr.parent_id) {
      const parent = catMap.get(curr.parent_id);
      if (!parent) break;
      curr = parent;
    }
    return curr.id;
  }

  const itemsRes = await client.query("SELECT name, sale_cat_l1, sale_cat_l2, sale_cat_l3 FROM sale_items WHERE name ILIKE '%soğan%' OR name ILIKE '%makarna%' OR name ILIKE '%pizza%' LIMIT 10;");
  const items = itemsRes.rows;

  for (const item of items) {
    const ids = [item.sale_cat_l1, item.sale_cat_l2, item.sale_cat_l3].filter(Boolean);
    const rootNames = ids.map(id => {
      const rId = getRootCategoryId(id);
      return rId ? catMap.get(rId).name : 'None';
    });
    const actualNames = ids.map(id => catMap.get(id) ? catMap.get(id).name : 'Unknown');

    console.log(`Product: ${item.name}`);
    console.log(`  Categories: ${actualNames.join(' -> ')}`);
    console.log(`  Root mapped: ${rootNames.join(', ')}`);
    console.log(`  Direct IDs in columns: ${ids.join(', ')}`);
  }

  await client.end();
}

main().catch(console.error);
