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
    
    // Find the sale item
    const res = await client.query("SELECT id, name, recipe_rows FROM public.sale_items WHERE name = 'Acı Mayo Burger'");
    if (!res.rows.length) {
      console.log('Acı Mayo Burger not found');
      return;
    }
    
    const item = res.rows[0];
    let recipeRows = item.recipe_rows;
    if (typeof recipeRows === 'string') {
      recipeRows = JSON.parse(recipeRows);
    }
    
    if (!Array.isArray(recipeRows)) {
      console.log('Recipe rows is not an array');
      return;
    }
    
    let updated = false;
    recipeRows.forEach((row) => {
      // Find the row for Çay Poşeti (sku STK-IC-06 or check name/id)
      if (row.sku === 'STK-IC-06' || row.stock_item_id === 'b1020000-0000-4000-8000-000000000006' || row.name === 'Çay Poşeti') {
        console.log('Found row for Çay Poşeti. Current portions:', row.portions);
        row.portions = ['__standart__'];
        console.log('Updated portions to:', row.portions);
        updated = true;
      }
    });
    
    if (updated) {
      const updateRes = await client.query(
        "UPDATE public.sale_items SET recipe_rows = $1 WHERE id = $2",
        [JSON.stringify(recipeRows), item.id]
      );
      console.log('Database updated successfully. Rows affected:', updateRes.rowCount);
    } else {
      console.log('Çay Poşeti row not found in recipe_rows');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

run();
