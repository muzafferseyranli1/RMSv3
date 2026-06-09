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
    
    // sale items
    const res1 = await client.query("SELECT name, recipe_rows FROM public.sale_items WHERE recipe_rows IS NOT NULL");
    // semi items
    const res2 = await client.query("SELECT name, recipe_rows FROM public.semi_items WHERE recipe_rows IS NOT NULL");
    
    const printRecipes = (rows, type) => {
      rows.forEach(item => {
        let recipe = item.recipe_rows;
        if (typeof recipe === 'string') {
          try { recipe = JSON.parse(recipe); } catch (e) { recipe = []; }
        }
        if (Array.isArray(recipe)) {
          recipe.forEach(row => {
            if (row.portions && row.portions.length > 0) {
              console.log(`[${type}] Item: ${item.name} -> Ingredient: ${row.name || row.sku} -> Portions: ${JSON.stringify(row.portions)}`);
            }
          });
        }
      });
    };
    
    printRecipes(res1.rows, 'Sale Item');
    printRecipes(res2.rows, 'Semi Product');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

run();
