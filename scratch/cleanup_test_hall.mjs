import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway',
    ssl: false,
  });
  await client.connect();
  await client.query("DELETE FROM public.pos_table_halls WHERE name LIKE 'Test Salon%';");
  console.log('Cleaned up test hall records.');
  await client.end();
}

main();
