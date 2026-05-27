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
    throw new Error('DATABASE_URL not found in server/.env');
  }

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('rlwy.net') ? { rejectUnauthorized: false } : false
  });
  await client.connect();
  console.log('Connected to database, running ALTER TABLE...');
  await client.query(`
    ALTER TABLE public.form_templates ADD COLUMN IF NOT EXISTS allowed_contexts JSONB DEFAULT '["merkez", "sube", "depo"]'::jsonb;
  `);
  console.log('Column allowed_contexts added successfully to form_templates table.');
  await client.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
