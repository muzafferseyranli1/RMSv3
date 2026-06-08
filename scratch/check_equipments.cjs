const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../server/.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    await client.connect();
    
    const defsRes = await client.query('SELECT COUNT(*) FROM equipment_definitions');
    console.log("Equipment Definitions Count:", defsRes.rows[0].count);

    const instancesRes = await client.query('SELECT COUNT(*) FROM equipment_instances');
    console.log("Equipment Instances Count:", instancesRes.rows[0].count);

    const defs = await client.query('SELECT * FROM equipment_definitions LIMIT 10');
    console.log("Definitions details:", defs.rows);
    
    const insts = await client.query('SELECT * FROM equipment_instances LIMIT 10');
    console.log("Instances details:", insts.rows);

  } catch (e) {
    console.error("Error connecting or querying:", e);
  } finally {
    await client.end();
  }
}

main();
