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

  console.log('Finding duplicates for 2026-05-28...');
  const findRes = await client.query(`
    SELECT id, order_no, branch_name, flow_name, created_at,
           ROW_NUMBER() OVER (
             PARTITION BY flow_id, branch_id, order_date
             ORDER BY created_at ASC
           ) as row_num
    FROM purchase_orders
    WHERE order_date = '2026-05-28';
  `);

  const duplicates = findRes.rows.filter(r => r.row_num > 1);
  console.log(`Found ${duplicates.length} duplicate orders to delete.`);

  if (duplicates.length > 0) {
    const idsToDelete = duplicates.map(d => `'${d.id}'`).join(',');
    const deleteRes = await client.query(`
      DELETE FROM purchase_orders
      WHERE id IN (${idsToDelete});
    `);
    console.log(`Successfully deleted ${deleteRes.rowCount} duplicate purchase orders.`);
  } else {
    console.log('No duplicates found.');
  }

  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
