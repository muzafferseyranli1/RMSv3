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
      SELECT name, recipe_rows, portions 
      FROM public.sale_items 
      WHERE name = 'Acı Mayo Burger'
    `);
    
    if (res.rows.length) {
      console.log('Product:', res.rows[0].name);
      let recipeRows = res.rows[0].recipe_rows;
      if (typeof recipeRows === 'string') {
        recipeRows = JSON.parse(recipeRows);
      }
      recipeRows.forEach((row, index) => {
        console.log(`Row ${index + 1}: Name=${row.name || row.sku}, Portions=${JSON.stringify(row.portions)}`);
      });
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
