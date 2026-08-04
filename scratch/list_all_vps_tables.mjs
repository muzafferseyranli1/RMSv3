import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway',
    ssl: false,
  });
  await client.connect();
  
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);

  console.log(`Total tables in VPS DB: ${res.rows.length}`);
  console.log(res.rows.map(r => r.table_name).join('\n'));

  await client.end();
}

main();
