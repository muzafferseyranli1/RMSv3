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

  console.log('Querying first row of sale_items...');
  const res = await client.query('SELECT * FROM "sale_items" WHERE "deleted_at" IS NULL LIMIT 1');
  if (res.rows.length === 0) {
    console.log('No sale items found');
    await client.end();
    return;
  }

  const row = res.rows[0];
  const colSizes = {};
  for (const key of Object.keys(row)) {
    const val = row[key];
    const size = val ? JSON.stringify(val).length : 0;
    colSizes[key] = size;
  }

  console.log('First row column stringified sizes (bytes):', colSizes);

  console.log('Checking all rows column-wise total stringified sizes (bytes):');
  const allRes = await client.query('SELECT * FROM "sale_items" WHERE "deleted_at" IS NULL');
  const totals = {};
  for (const r of allRes.rows) {
    for (const key of Object.keys(r)) {
      const val = r[key];
      const size = val ? JSON.stringify(val).length : 0;
      totals[key] = (totals[key] || 0) + size;
    }
  }
  console.log(totals);

  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
