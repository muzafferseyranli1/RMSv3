const { Client } = require('pg');
const DATABASE_URL = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: false });
  await client.connect();

  const res = await client.query('SELECT id, name, parent_id FROM sale_categories WHERE deleted_at IS NULL;');
  const categories = res.rows;

  console.log('Root categories (parent_id is null):');
  const roots = categories.filter(c => !c.parent_id);
  console.log(JSON.stringify(roots, null, 2));

  await client.end();
}

main().catch(console.error);
