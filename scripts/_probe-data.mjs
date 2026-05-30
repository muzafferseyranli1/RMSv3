import pg from 'pg';
const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway',
  ssl: false
});

async function run() {
  await client.connect();
  const res = await client.query(`SELECT * FROM company_nodes WHERE type = 'branch' LIMIT 1`);
  console.log('Branch:', res.rows[0]);
  
  const items = await client.query(`SELECT * FROM sale_items WHERE deleted_at IS NULL AND sale_status = true AND setting_active = true LIMIT 1`);
  console.log('Item:', items.rows[0]);

  await client.end();
}
run();
