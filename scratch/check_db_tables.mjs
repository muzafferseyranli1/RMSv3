import pg from 'pg';
const { Client } = pg;

async function checkDb(name, url, ssl) {
  console.log(`\n--- Checking ${name} ---`);
  console.log(`URL: ${url}`);
  const client = new Client({
    connectionString: url,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    console.log(`Connected to ${name} successfully!`);
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log(`Total tables: ${res.rows.length}`);
    const tableNames = res.rows.map(r => r.table_name);
    console.log(`Has 'sales'? ${tableNames.includes('sales')}`);
    console.log(`Has 'sale_lines'? ${tableNames.includes('sale_lines')}`);
    console.log(`Sample tables: ${tableNames.slice(0, 15).join(', ')}`);

    if (tableNames.includes('sales')) {
      const salesCount = await client.query('SELECT COUNT(*) FROM sales;');
      console.log(`Sales row count: ${salesCount.rows[0].count}`);
    }
    if (tableNames.includes('sale_lines')) {
      const linesCount = await client.query('SELECT COUNT(*) FROM sale_lines;');
      console.log(`Sale_lines row count: ${linesCount.rows[0].count}`);
    }
  } catch (err) {
    console.error(`Error connecting/querying ${name}:`, err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  // VPS DB
  await checkDb('VPS PostgreSQL (188.132.198.144)', 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway', false);
  // Old Railway DB
  await checkDb('Old Railway DB', 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway', true);
}

main();
