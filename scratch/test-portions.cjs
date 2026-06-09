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
      SELECT name, portions 
      FROM public.sale_items 
      WHERE name = 'Acı Mayo Burger'
    `);
    
    if (res.rows.length) {
      console.log('Product:', res.rows[0].name);
      console.log('Portions:', JSON.stringify(res.rows[0].portions, null, 2));
    } else {
      console.log('Product not found');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

run();
