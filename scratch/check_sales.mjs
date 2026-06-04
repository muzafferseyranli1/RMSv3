import pg from 'pg';

const { Client } = pg;
const DATABASE_URL = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: false
  });
  await client.connect();

  try {
    const branchRes = await client.query(`
      SELECT id FROM company_nodes WHERE name = 'Kadıköy Şubesi' AND type = 'sube'
    `);
    const branchId = branchRes.rows[0].id;

    const salesRes = await client.query(`
      SELECT 
        to_char(sale_datetime AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') as local_date, 
        count(*)::int as count 
      FROM sales 
      WHERE branch_id = $1 
        AND sale_datetime >= '2026-05-25T00:00:00+03:00'
      GROUP BY local_date 
      ORDER BY local_date ASC
    `, [branchId]);

    console.log('Local Sales per day for Kadıköy Şubesi:');
    console.table(salesRes.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
