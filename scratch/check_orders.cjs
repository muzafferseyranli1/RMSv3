const pg = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const envContent = fs.readFileSync(path.resolve(__dirname, '..', 'server', '.env'), 'utf8');
  let dbUrl;
  for (const line of envContent.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const sep = l.indexOf('=');
    if (sep === -1) continue;
    if (l.slice(0, sep).trim() === 'DATABASE_URL') {
      let v = l.slice(sep + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      dbUrl = v;
      break;
    }
  }

  if (!dbUrl) {
    throw new Error('DATABASE_URL not found');
  }

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('rlwy.net') ? { rejectUnauthorized: false } : false
  });
  await client.connect();
  
  const res = await client.query(`
    select id, order_no, branch_id, branch_name, flow_id, flow_name, supplier_name, order_date, status, created_at 
    from purchase_orders 
    order by created_at desc 
    limit 20;
  `);
  
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
