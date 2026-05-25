import pg from 'pg';
import fs from 'fs';
import path from 'path';

// Parse server/.env manually
const envPath = 'C:\\RMSv3\\server\\.env';
const envContent = fs.readFileSync(envPath, 'utf8');
let databaseUrl = '';
for (const line of envContent.split('\n')) {
  if (line.trim().startsWith('DATABASE_URL=')) {
    databaseUrl = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function run() {
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE data_type IN ('json', 'jsonb')
      ORDER BY table_name, column_name
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
