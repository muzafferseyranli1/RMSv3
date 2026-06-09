const { Client } = require('pg');

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
    console.log('Connected to DB.');

    const res = await client.query(`SELECT id, name, supplier_id, flow_channel FROM public.order_flows;`);
    console.log('Order Flows:');
    console.log(res.rows);

    const supRes = await client.query(`SELECT id, name, supplier_kind, sync_key FROM public.suppliers;`);
    console.log('Suppliers:');
    console.log(supRes.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
