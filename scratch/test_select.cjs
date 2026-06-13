const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../server/.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const connectionString = process.env.DATABASE_URL;
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function run() {
  await client.connect();
  try {
    const res = await client.query('SELECT *, warehouse_locations(zone_code,aisle,rack,level,bin) FROM warehouse_lpns LIMIT 1');
    console.log('Success:', res.rows);
  } catch (err) {
    console.error('Error:', err.message);
  }
  await client.end();
}
run();
