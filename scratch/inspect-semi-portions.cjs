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
    
    const res = await client.query("SELECT id, name, portions FROM public.semi_items LIMIT 5");
    console.log('Semi items portions:');
    console.log(res.rows);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

run();
