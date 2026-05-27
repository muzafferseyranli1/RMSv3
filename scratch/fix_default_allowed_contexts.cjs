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
  console.log('Connected to database, running updates...');
  
  // Set default to center, branch, warehouse
  await client.query(`
    ALTER TABLE public.form_templates ALTER COLUMN allowed_contexts SET DEFAULT '["center", "branch", "warehouse"]'::jsonb;
    UPDATE public.form_templates SET allowed_contexts = '["center", "branch", "warehouse"]'::jsonb WHERE allowed_contexts IS NULL OR allowed_contexts::text = '["merkez", "sube", "depo"]';
  `);
  console.log('Successfully updated default and set existing allowed_contexts to workspace scopes.');
  await client.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
