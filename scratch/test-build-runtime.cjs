const pg = require('pg');
const fs = require('fs');
const path = require('path');

function stripEmptyValues(val) {
  if (val === null || val === undefined) return undefined
  
  if (Array.isArray(val)) {
    if (val.length === 0) return undefined
    const cleanedArr = val.map(stripEmptyValues).filter(v => v !== undefined)
    return cleanedArr.length > 0 ? cleanedArr : undefined
  }
  
  if (typeof val === 'object' && val.constructor === Object) {
    const cleanedObj = {}
    for (const [k, v] of Object.entries(val)) {
      const cv = stripEmptyValues(v)
      if (cv !== undefined) {
        cleanedObj[k] = cv
      }
    }
    return cleanedObj
  }
  
  return val
}

function cleanApiResponse(result) {
  if (!result || !result.data) return result
  const cleanedData = result.data.map(row => {
    const cleaned = stripEmptyValues(row)
    return cleaned === undefined ? {} : cleaned
  })
  return { data: cleanedData, error: result.error ?? null }
}

async function run() {
  const envContent = fs.readFileSync(path.resolve(__dirname, '..', 'server', '.env'), 'utf8');
  let dbUrl;
  for (const line of envContent.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const sep = l.indexOf('=');
    if (sep === -1) continue;
    if (l.slice(0, sep).trim() === 'DATABASE_URL') {
      let v = l.slice(sep + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      dbUrl = v;
      break;
    }
  }

  if (!dbUrl) {
    throw new Error('DATABASE_URL not found');
  }

  console.log('Connecting to database...');
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('rlwy.net') ? { rejectUnauthorized: false } : false
  });
  await client.connect();

  const queries = [
    { name: 'sale_items', sql: `SELECT * FROM "sale_items" WHERE "deleted_at" IS NULL ORDER BY "name"` },
    { name: 'sales_channels', sql: `SELECT * FROM "sales_channels" WHERE "deleted_at" IS NULL AND "active" = true ORDER BY "sort_order"` },
    { name: 'sale_categories', sql: `SELECT "id","name","parent_id","deleted_at" FROM "sale_categories" WHERE "deleted_at" IS NULL ORDER BY "name"` },
    { name: 'taxes', sql: `SELECT "id","name","rate","deleted_at" FROM "taxes" WHERE "deleted_at" IS NULL ORDER BY "rate"` },
    { name: 'stock_items', sql: `SELECT "id","name","sku","unit" FROM "stock_items" WHERE "deleted_at" IS NULL ORDER BY "name"` },
    { name: 'semi_items', sql: `SELECT "id","name","sku","recipe_output_unit" FROM "semi_items" WHERE "deleted_at" IS NULL ORDER BY "name"` }
  ];

  for (const query of queries) {
    console.log(`Running query: ${query.name}...`);
    try {
      const res = await client.query(query.sql);
      console.log(`- Found ${res.rows.length} rows.`);
      
      const wrapped = { data: res.rows, error: null };
      console.log(`- Running cleanApiResponse...`);
      const cleaned = cleanApiResponse(wrapped);
      
      console.log(`- Running JSON.stringify...`);
      const json = JSON.stringify(cleaned);
      console.log(`- Stringified size: ${json.length} bytes`);
      
    } catch (err) {
      console.error(`Error with query ${query.name}:`, err);
    }
  }

  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
