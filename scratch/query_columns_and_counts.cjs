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
        const columnsRes = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = '${table}';
        `);
        const columns = columnsRes.rows.map(r => r.column_name);
        console.log(`Table ${table} columns:`, columns.join(', '));

        const activeRes = await client.query(`SELECT count(*) FROM public.${table} WHERE deleted_at IS NULL;`);
        console.log(`Table ${table} active (deleted_at IS NULL) count:`, activeRes.rows[0].count);
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
