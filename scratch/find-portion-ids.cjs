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
    
    // Get all sale item portions
    const res1 = await client.query("SELECT id, name, portions FROM public.sale_items WHERE portions IS NOT NULL");
    // Get all semi item portions
    const res2 = await client.query("SELECT id, name, portions FROM public.semi_items WHERE portions IS NOT NULL");
    
    const portionMap = {};
    
    const processPortions = (rows, label) => {
      rows.forEach(row => {
        let ports = row.portions;
        if (typeof ports === 'string') {
          try { ports = JSON.parse(ports); } catch (e) { ports = []; }
        }
        if (Array.isArray(ports)) {
          ports.forEach(p => {
            if (p && p.id && p.name) {
              portionMap[p.id] = portionMap[p.id] || new Set();
              portionMap[p.id].add(p.name);
            }
          });
        }
      });
    };
    
    processPortions(res1.rows, 'sale_items');
    processPortions(res2.rows, 'semi_items');
    
    console.log('All portion IDs found in system:');
    for (const [id, names] of Object.entries(portionMap)) {
      console.log(`ID: ${id} -> Names: ${Array.from(names).join(', ')}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

run();
