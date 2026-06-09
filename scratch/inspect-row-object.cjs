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
      SELECT recipe_rows 
      FROM public.sale_items 
      WHERE name = 'Acı Mayo Burger'
    `);
    
    if (res.rows.length) {
      let recipeRows = res.rows[0].recipe_rows;
      if (typeof recipeRows === 'string') {
        recipeRows = JSON.parse(recipeRows);
      }
      console.log('Row 1 Portions:', JSON.stringify(recipeRows[0].portions));
      console.log('Row 2 Portions:', JSON.stringify(recipeRows[1].portions));
      console.log('Row 7 Portions:', JSON.stringify(recipeRows[6].portions));
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
