const { Client } = require('pg');

const DATABASE_URL = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function updateDb() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: false });
  try {
    await client.connect();
    
    // Masaları boşalt (garson_open_table_tickets_v2)
    const res1 = await client.query(`UPDATE settings SET value = '{}'::jsonb WHERE key = 'garson_open_table_tickets_v2'`);
    console.log('garson_open_table_tickets_v2 update:', res1.rowCount);

    // KDS'de bekleyen sale_lines'ları kds_completed = true yap
    const res2 = await client.query(`UPDATE sale_lines SET kds_completed = true WHERE kds_completed = false OR kds_completed IS NULL`);
    console.log('sale_lines kds_completed update:', res2.rowCount);

    // sales statüsünü completed yap (kds_status dahil)
    const res3 = await client.query(`UPDATE sales SET kds_status = 'delivered' WHERE kds_status != 'delivered' OR kds_status IS NULL`);
    console.log('sales kds_status update:', res3.rowCount);

    const res4 = await client.query(`UPDATE sales SET status = 'completed' WHERE status != 'completed' OR status IS NULL`);
    console.log('sales status update:', res4.rowCount);

    console.log('SUCCESS');
  } catch(e) {
    console.error('ERROR:', e);
  } finally {
    await client.end();
  }
}

updateDb();
