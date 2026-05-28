import pg from 'pg';
import fs from 'fs';
import path from 'path';

// Load DB Connection
const envContent = fs.readFileSync(path.resolve('server/.env'), 'utf8');
const dbUrlMatch = envContent.match(/DATABASE_URL=(.*)/);
if (!dbUrlMatch) {
  console.error('DATABASE_URL not found in server/.env');
  process.exit(1);
}
const connectionString = dbUrlMatch[1].trim();

const client = new pg.Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  await client.connect();
  console.log('Connected to Railway Postgres for orphan cleanup.');

  try {
    // Find recalcs with source_movement_id that doesn't exist in inventory_movements
    const res = await client.query(`
      SELECT r.id, r.source_movement_id, r.item_type, r.reason
      FROM inventory_movement_recalc_jobs r
      LEFT JOIN inventory_movements m ON r.source_movement_id = m.id
      WHERE r.source_movement_id IS NOT NULL AND m.id IS NULL
    `);

    console.log(`Found ${res.rows.length} orphaned recalc jobs.`);

    if (res.rows.length > 0) {
      const ids = res.rows.map(r => r.id);
      console.log('Orphaned recalc job IDs:', ids);
      
      const updateRes = await client.query(`
        UPDATE inventory_movement_recalc_jobs
        SET source_movement_id = NULL
        WHERE id = ANY($1)
      `, [ids]);
      
      console.log(`Successfully cleared source_movement_id for ${updateRes.rowCount} rows.`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
