import pg from 'pg';
import fs from 'fs';
import path from 'path';

const envContent = fs.readFileSync(path.join('server', '.env'), 'utf8');
const dbUrlMatch = envContent.match(/DATABASE_URL=(.*)/);
const connectionString = dbUrlMatch[1].trim();

const client = new pg.Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  await client.connect();

  try {
    const res = await client.query("SELECT * FROM company_nodes");
    const nodes = res.rows;
    const nodesById = new Map(nodes.map(n => [n.id, n]));

    let current = nodes.find(n => n.name === 'Kadıköy Şubesi');
    if (!current) {
      console.log('Kadıköy Şubesi not found');
      return;
    }

    console.log('Path for Kadıköy Şubesi:');
    while (current) {
      console.log(`- ID: ${current.id}, Name: ${current.name}, Type: ${current.type}, Parent: ${current.parent_id}`);
      current = nodesById.get(current.parent_id);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
