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
      SELECT name, sku 
      FROM public.stock_items 
      WHERE sku = 'STK-IC-06'
    `);
    
    if (res.rows.length) {
      console.log('Stock item:', res.rows[0].name, res.rows[0].sku);
    } else {
      console.log('Item not found in stock_items');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

run();
