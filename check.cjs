const { Client } = require('pg');
const DATABASE_URL = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';
async function getCheck() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: false });
  await client.connect();
  const res = await client.query(\$query\);
  console.log(res.rows);
  await client.end();
}
getCheck();
