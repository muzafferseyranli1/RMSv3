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

    const tables = ['equipment_definitions', 'manual_categories', 'manual_pages', 'manual_page_equipments'];
    for (const table of tables) {
      const existsRes = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `, [table]);
      const exists = existsRes.rows[0].exists;
      console.log(`Table '${table}' exists: ${exists}`);

      if (exists) {
        const countRes = await client.query(`SELECT COUNT(*) FROM public.${table};`);
        console.log(`Table '${table}' row count: ${countRes.rows[0].count}`);
        
        if (table === 'equipment_definitions' || table === 'manual_categories') {
          const sampleRes = await client.query(`SELECT * FROM public.${table} LIMIT 3;`);
          console.log(`Sample rows from '${table}':`, sampleRes.rows);
        }
      }
    }

  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await client.end();
  }
}

main();
