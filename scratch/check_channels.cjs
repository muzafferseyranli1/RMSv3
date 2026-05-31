const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function run() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const res = await client.query(`
      SELECT id, sales_channel_name, lower(trim(sales_channel_name)) as lowered
      FROM sales
      WHERE customer_id = 'd8d3477f-1fba-4171-be4d-703285c47004'
      LIMIT 5
    `);
    console.log('Sales channels query result:');
    console.log(res.rows);

    // Let's also check public.normalize_sales_channel_key output for the channel names!
    const res2 = await client.query(`
      SELECT sales_channel_name, public.normalize_sales_channel_key(sales_channel_name) as normalized
      FROM sales
      WHERE customer_id = 'd8d3477f-1fba-4171-be4d-703285c47004'
      LIMIT 5
    `);
    console.log('Normalized channel result:');
    console.log(res2.rows);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
