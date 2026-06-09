const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required. Refusing to run migration without an explicit connection string.');
}

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB successfully.');

    const sqlPath = path.join(__dirname, '..', 'migrations', '033_add_image_url_to_stock_items.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing migration SQL...');
    await client.query(sqlContent);
    console.log('✅ Migration 033 applied successfully (image_url added to stock_items).');

  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
