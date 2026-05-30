import pg from 'pg';
const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway',
  ssl: false
});

async function run() {
  await client.connect();
  const res = await client.query(`SELECT id, type, name FROM company_nodes`);
  console.log('Nodes Types:', Array.from(new Set(res.rows.map(r => r.type))));
  console.log('Sample branch:', res.rows.find(r => r.type === 'branch' || r.type === 'SUBE' || r.name.toLowerCase().includes('sube')));
  await client.end();
}
run();
