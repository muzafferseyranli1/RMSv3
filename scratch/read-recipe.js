const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../server/.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function run() {
  try {
    await client.connect();
    
    const res = await client.query(`
      SELECT id, name, recipe_rows, portions, channel_prices 
      FROM public.sale_items 
      WHERE name LIKE '%Mayo%' OR name LIKE '%Burger%'
      LIMIT 5
    `);
    
    for (const row of res.rows) {
      console.log('--------------------------------------------------');
      console.log(`Product: ${row.name} (ID: ${row.id})`);
      console.log('Portions:', JSON.stringify(row.portions, null, 2));
      console.log('Recipe Rows:', JSON.stringify(row.recipe_rows, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

run();
