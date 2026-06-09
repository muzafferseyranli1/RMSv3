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
    
    // Find the sale item first
    const saleItemRes = await client.query("SELECT id, name, portions FROM public.sale_items WHERE name = 'Acı Mayo Burger'");
    if (!saleItemRes.rows.length) {
      console.log('Acı Mayo Burger not found');
      return;
    }
    const saleItemId = saleItemRes.rows[0].id;
    console.log('Sale Item ID:', saleItemId);
    console.log('Sale Item Portions:', saleItemRes.rows[0].portions);
    
    // Find the manual page
    const pageRes = await client.query("SELECT id, title, linked_item_id, linked_item_type FROM public.manual_pages WHERE linked_item_id = $1", [saleItemId]);
    if (!pageRes.rows.length) {
      console.log('Manual page not found for Acı Mayo Burger');
      return;
    }
    const pageId = pageRes.rows[0].id;
    console.log('Manual Page:', pageRes.rows[0]);
    
    // Query context via SQL logic matching the server's endpoint
    let recipeRows = [];
    let portionsArr = [];
    let channelPrices = [];
    
    const itemRes = await client.query('SELECT recipe_rows, portions, channel_prices FROM public.sale_items WHERE id = $1', [saleItemId]);
    if (itemRes.rows.length) {
      recipeRows = itemRes.rows[0].recipe_rows || [];
      portionsArr = itemRes.rows[0].portions || [];
      channelPrices = itemRes.rows[0].channel_prices || [];
    }
    
    if (typeof recipeRows === 'string') {
      recipeRows = JSON.parse(recipeRows);
    }
    if (typeof portionsArr === 'string') {
      portionsArr = JSON.parse(portionsArr);
    }
    if (typeof channelPrices === 'string') {
      channelPrices = JSON.parse(channelPrices);
    }

    const portionNames = { '__standart__': 'Standart' };
    if (Array.isArray(portionsArr)) {
      portionsArr.forEach(p => { if (p && p.id && p.name) portionNames[p.id] = p.name; });
    }

    const allChannels = Array.isArray(channelPrices)
      ? channelPrices.map(cp => ({ id: cp.channel_id || cp.id, name: cp.channel_name || cp.name || cp.channel_id || cp.id }))
      : [];
      
    console.log('PortionNames built:', portionNames);
    console.log('AllChannels built:', allChannels);
    
    recipeRows.forEach((r, idx) => {
      console.log(`\nRow ${idx+1}: ${r.sku} - Portions: ${JSON.stringify(r.portions)}`);
      if (r.portions) {
        r.portions.forEach(portKey => {
          const name = portionNames[portKey];
          console.log(`  Portion Key: "${portKey}" -> Name: ${name || 'NOT FOUND'}`);
        });
      }
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

run();
