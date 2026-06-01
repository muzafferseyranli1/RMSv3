const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';
const client = new Client({
  connectionString,
  ssl: false
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to Railway Postgres database.');

    const sqlPath = path.join(__dirname, '..', 'migrations', '024_add_image_url_to_sale_categories.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Executing SQL migration:\n', sql);
    const res = await client.query(sql);
    console.log('Migration execution result:', res);
    console.log('Successfully applied database migration!');
  } catch (error) {
    console.error('Error executing migration:', error);
  } finally {
    await client.end();
  }
}

main();
