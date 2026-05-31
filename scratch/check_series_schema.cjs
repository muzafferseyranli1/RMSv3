const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';
const customerId = 'd8d3477f-1fba-4171-be4d-703285c47004';
const campaignId = 'campaign-mpl0qzbb7sya2n';
const seriesId = 'coupon-series-mpjl0u8zzlmg2';

async function run() {
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Kolon adlarını öğren
  const cols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'loyalty_coupon_series' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log('loyalty_coupon_series kolonları:');
  for (const c of cols.rows) console.log(`  ${c.column_name} (${c.data_type})`);

  // Series verisini çek
  const seriesRes = await client.query(`SELECT * FROM loyalty_coupon_series WHERE id = $1`, [seriesId]);
  console.log('\nSeries verisi:', JSON.stringify(seriesRes.rows[0], null, 2));

  await client.end();
}
run().catch(console.error);
