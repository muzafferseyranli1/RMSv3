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
  console.log('Connected to Railway Postgres.');

  try {
    const res = await client.query('SELECT count(*) FROM daily_sales');
    console.log(`Total rows in daily_sales: ${res.rows[0].count}`);

    if (res.rows[0].count > 0) {
      const sample = await client.query('SELECT * FROM daily_sales LIMIT 5');
      console.log('Samples of daily_sales:');
      for (const r of sample.rows) {
        console.log(`- Date: ${r.sale_date.toISOString().split('T')[0]}, Branch: ${r.branch_name}, Total: ${r.total_sales}, count: ${r.receipt_count}`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
