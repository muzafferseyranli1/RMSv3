const { Client } = require('pg');

const connectionString = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB.');

    for (const table of ['stock_items', 'sale_items', 'semi_items']) {
      try {
        const countRes = await client.query(`SELECT count(*) FROM public.${table};`);
        const sampleRes = await client.query(`SELECT id, name FROM public.${table} LIMIT 3;`);
        console.log(`Table ${table} has ${countRes.rows[0].count} rows. Samples:`, sampleRes.rows);
      } catch (e) {
        console.error(`Error on table ${table}:`, e.message);
      }
    }
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await client.end();
  }
}

main();
