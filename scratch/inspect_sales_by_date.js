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
    const selectedBranchName = 'Kadıköy Şubesi';
    const aliases = ['Kadıköy Şubesi', 'Kadıköy'];
    
    console.log('Aliases:', aliases);
    
    const countRes = await client.query(`
      SELECT branch_name, count(*) 
      FROM sales 
      WHERE sale_datetime >= '2026-05-01T00:00:00Z'
      GROUP BY branch_name
    `);
    console.log('Branch names in DB after May 1, 2026:');
    for (const r of countRes.rows) {
      console.log(`- "${r.branch_name}": ${r.count}`);
    }

    const matchRes = await client.query(`
      SELECT count(*) 
      FROM sales 
      WHERE status = 'completed'
        AND branch_name = ANY($1)
        AND sale_datetime >= '2026-05-01T00:00:00Z'
    `, [aliases]);
    console.log(`Matches in DB using ANY(aliases) after May 1, 2026: ${matchRes.rows[0].count}`);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
