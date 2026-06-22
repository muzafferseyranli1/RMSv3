const { Client } = require('pg');
const DATABASE_URL = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: false });
  await client.connect();

  const res = await client.query("SELECT key, value FROM settings WHERE key = 'kiosk_settings_v2';");
  console.log(JSON.stringify(res.rows[0], null, 2));

  await client.end();
}

main().catch(console.error);
