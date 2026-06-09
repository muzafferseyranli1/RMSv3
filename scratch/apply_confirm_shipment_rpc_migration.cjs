const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is missing. Please define it in environment variables.");
  process.exit(1);
}

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB successfully.');

    const sqlPath = path.join(__dirname, '..', 'migrations', '032_confirm_shipment_rpc.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing confirm_warehouse_shipment RPC SQL...');
    await client.query(sqlContent);
    console.log('✅ RPC Function applied successfully.');

  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
