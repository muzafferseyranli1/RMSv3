const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function loadServerEnv() {
  const envPath = path.join(__dirname, '../server/.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadServerEnv();

const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB.');

    // 1. Get column names and types for purchase_orders
    const poColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'purchase_orders' AND table_schema = 'public';
    `);
    console.log('\n--- PURCHASE ORDERS COLUMNS ---');
    console.log(poColumns.rows.map(r => `${r.column_name}: ${r.data_type}`).join('\n'));

    // 2. Get column names and types for suppliers
    const sColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'suppliers' AND table_schema = 'public';
    `);
    console.log('\n--- SUPPLIERS COLUMNS ---');
    console.log(sColumns.rows.map(r => `${r.column_name}: ${r.data_type}`).join('\n'));

    // 3. Query distinct supplier_kind
    const sKinds = await client.query(`
      SELECT DISTINCT supplier_kind FROM public.suppliers;
    `);
    console.log('\n--- DISTINCT SUPPLIER KINDS ---');
    console.log(sKinds.rows);

    // 4. Query distinct flow_channels
    const poFlows = await client.query(`
      SELECT DISTINCT flow_channel FROM public.purchase_orders;
    `);
    console.log('\n--- DISTINCT FLOW CHANNELS ---');
    console.log(poFlows.rows);

  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await client.end();
  }
}

main();
