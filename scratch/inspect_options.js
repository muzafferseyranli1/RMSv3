const { Client } = require('pg');
const DATABASE_URL = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: false });
  await client.connect();
  const res = await client.query('SELECT id, name, options FROM option_groups LIMIT 10;');
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(console.error);
