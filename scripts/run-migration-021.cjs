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
    keepAlive: true,
  });
  await client.connect();
  const sql = fs.readFileSync(path.resolve(__dirname, '..', 'migrations', '021_pos_terminals.sql'), 'utf8');
  await client.query(sql);
  console.log('Migration 021 applied successfully');
  await client.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
