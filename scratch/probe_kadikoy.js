import pg from 'pg';
import fs from 'fs';
import path from 'path';

const envContent = fs.readFileSync(path.join('server', '.env'), 'utf8');
const dbUrlMatch = envContent.match(/DATABASE_URL=(.*)/);
if (!dbUrlMatch) {
  console.error('DATABASE_URL not found in server/.env');
  process.exit(1);
}
const connectionString = dbUrlMatch[1].trim();

const client = new pg.Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  await client.connect();
  console.log('Connected to DB');

  // Query company_nodes or settings or other tables
  try {
    const res = await client.query("SELECT * FROM information_schema.tables WHERE table_name = 'company_nodes'");
    console.log('company_nodes table exists:', res.rows.length > 0);

    const branchesRes = await client.query("SELECT * FROM company_nodes WHERE type = 'sube' OR name ILIKE '%Kadıköy%'");
    console.log('Branches matching Kadıköy:', branchesRes.rows);

    const settingsRes = await client.query("SELECT * FROM settings WHERE key = 'company_tree'");
    console.log('company_tree settings row found:', settingsRes.rows.length > 0);
  } catch (err) {
    console.error('Error during probe:', err);
  } finally {
    await client.end();
  }
}

run();
