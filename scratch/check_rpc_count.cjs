const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';
const customerId = 'd8d3477f-1fba-4171-be4d-703285c47004';

async function run() {
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.\n');

  // Call the RPC to see what the actual count is now
  const productMasks = [{"id":"mask-mpl177tnntyukk","name":"Sütlü Kahve","type":"product","itemId":"b1040000-0000-4000-8000-000000000057"}];
  
  console.log('Calling get_customer_period_stats...');
  const rpcRes = await client.query({
    text: 'SELECT * FROM public.get_customer_period_stats($1, $2, $3, $4, $5, $6, $7, $8)',
    values: [
      customerId,
      'all_time',      // period
      30,              // periodDays (ignored for all_time)
      JSON.stringify(productMasks),
      true,            // excludeFreeItems
      true,            // allowSameItemRepeat
      [],              // currentProductIds
      'pos'            // salesChannel
    ]
  });

  const stats = rpcRes.rows[0];
  console.log('Stats:', JSON.stringify(stats, null, 2));
  console.log(`\nProduct quantity (Sütlü Kahve sold to this customer): ${stats?.product_quantity}`);
  console.log(`Order count: ${stats?.order_count}`);

  // Check table name for sales
  const tableCheck = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE '%sale%'
    ORDER BY table_name
  `);
  console.log('\nSale-related tables:');
  for (const t of tableCheck.rows) console.log(' ', t.table_name);

  await client.end();
}

run().catch(console.error);
