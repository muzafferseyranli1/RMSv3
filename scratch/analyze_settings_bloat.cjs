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

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('rlwy.net') ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  const { rows } = await client.query('SELECT key, octet_length(value::text) as size_bytes, value::text as val_str FROM settings');
  console.log('=== SETTINGS TABLE SIZE ANALYSIS ===');
  for (const row of rows) {
    const key = row.key;
    const size = row.size_bytes;
    const hasBase64 = row.val_str.includes('data:image');
    console.log(`Key: ${key.padEnd(35)} Size: ${(size / 1024).toFixed(2).padStart(8)} KB   Contains Base64: ${hasBase64 ? 'YES' : 'NO'}`);
  }
  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
