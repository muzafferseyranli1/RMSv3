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
  console.log('Connected to Railway Postgres for verification.');

  const targetDate = '2026-05-26';
  const targetBranchId = '4e488f4b-669d-4279-8f0d-0fd382fe1d87';

  try {
    const start = `${targetDate}T00:00:00+03:00`;
    const end = `${targetDate}T23:59:59+03:00`;

    const salesCountRes = await client.query(`
      SELECT count(*) as count, sum(gross_total_after_discount) as total_revenue
      FROM sales
      WHERE integration_ref = 'demo-sales-tool'
        AND branch_id = $1
        AND sale_datetime >= $2::timestamptz
        AND sale_datetime <= $3::timestamptz
    `, [targetBranchId, start, end]);

    const linesCountRes = await client.query(`
      SELECT count(*) as count
      FROM sale_lines
      WHERE branch_id = $1
        AND sale_datetime >= $2::timestamptz
        AND sale_datetime <= $3::timestamptz
    `, [targetBranchId, start, end]);

    const paymentsCountRes = await client.query(`
      SELECT count(*) as count, sum(amount) as total_payments
      FROM sale_payments
      WHERE sale_id IN (
        SELECT id FROM sales
        WHERE integration_ref = 'demo-sales-tool'
          AND branch_id = $1
          AND sale_datetime >= $2::timestamptz
          AND sale_datetime <= $3::timestamptz
      )
    `, [targetBranchId, start, end]);

    const movementsCountRes = await client.query(`
      SELECT count(*) as count
      FROM inventory_movements
      WHERE branch_id = $1
        AND movement_type = 'sale_consumption'
        AND movement_at >= $2::timestamptz
        AND movement_at <= $3::timestamptz
    `, [targetBranchId, start, end]);

    console.log('VERIFICATION RESULTS:');
    console.log(`- Sales count: ${salesCountRes.rows[0].count}, Revenue: ${salesCountRes.rows[0].total_revenue} TRY`);
    console.log(`- Lines count: ${linesCountRes.rows[0].count}`);
    console.log(`- Payments count: ${paymentsCountRes.rows[0].count}, Payment Total: ${paymentsCountRes.rows[0].total_payments} TRY`);
    console.log(`- Inventory Movements count: ${movementsCountRes.rows[0].count}`);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
