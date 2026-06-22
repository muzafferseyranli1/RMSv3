const { Client } = require('pg');
const DATABASE_URL = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: false });
  await client.connect();

  const res = await client.query(`
    SELECT id, name, active, sale_cat_l1, sale_cat_l2, sale_cat_l3, sale_cat_l4, sale_cat_l5 
    FROM sale_items 
    WHERE deleted_at IS NULL 
    LIMIT 20;
  `);

  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(console.error);
