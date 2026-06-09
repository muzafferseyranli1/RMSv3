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
    
    // Find tables
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE '%channel%'
    `);
    console.log('Tables containing channel:', tableRes.rows);
    
    // Let's also see what columns are in any channel-related table, or query it
    for (const row of tableRes.rows) {
      const colRes = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
      `, [row.table_name]);
      console.log(`Columns of ${row.table_name}:`, colRes.rows);
      
      try {
        const dataRes = await client.query(`SELECT * FROM public."${row.table_name}" LIMIT 5`);
        console.log(`Data of ${row.table_name}:`, dataRes.rows);
      } catch (err) {
        console.log(`Failed to fetch data from ${row.table_name}:`, err.message);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

run();
