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
  console.log('Connected to Postgres.');

  try {
    // 1. Fetch branches
    const branchesRes = await client.query(`
      SELECT id, name, type, parent_id 
      FROM company_nodes 
      WHERE type = 'sube'
      ORDER BY name
    `);
    console.log(`Found ${branchesRes.rows.length} branches:`);
    for (const b of branchesRes.rows) {
      console.log(`- ${b.name} (${b.id})`);
    }

    // 2. Query sales summary per branch and day
    const startDate = '2026-05-15';
    const endDate = '2026-05-29';

    const salesRes = await client.query(`
      SELECT 
        branch_id,
        branch_name,
        date_trunc('day', sale_datetime AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Istanbul') as sale_date,
        count(*) as count
      FROM sales
      WHERE sale_datetime >= $1::timestamptz AND sale_datetime <= $2::timestamptz
      GROUP BY branch_id, branch_name, sale_date
      ORDER BY branch_name, sale_date
    `, [`${startDate}T00:00:00+03:00`, `${endDate}T23:59:59+03:00`]);

    console.log(`\nExisting Sales Summary (from ${startDate} to ${endDate}):`);
    const salesMap = new Map(); // branchId -> Set of date string
    for (const r of salesRes.rows) {
      const dateStr = new Date(r.sale_date).toISOString().split('T')[0];
      const key = `${r.branch_id || r.branch_name}`;
      if (!salesMap.has(key)) salesMap.set(key, new Map());
      salesMap.get(key).set(dateStr, r.count);
    }

    // List missing days for each branch
    const allDays = [];
    let curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
      allDays.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }

    console.log('\nMissing sales report:');
    let totalMissingBranchDays = 0;
    for (const branch of branchesRes.rows) {
      const branchKey = branch.id;
      const branchSales = salesMap.get(branchKey) || new Map();
      const missingDays = [];
      for (const day of allDays) {
        const count = branchSales.get(day) || 0;
        // The demo sales generation requires a minimum of say 10 or 20 sales, but any day with 0 sales is definitely missing.
        // Let's print days where count is 0 or very low.
        if (count < 10) {
          missingDays.push(`${day} (${count} sales)`);
          totalMissingBranchDays++;
        }
      }
      if (missingDays.length > 0) {
        console.log(`Branch: ${branch.name} (${branch.id}) has ${missingDays.length} days missing:`);
        console.log(`  ${missingDays.join(', ')}`);
      } else {
        console.log(`Branch: ${branch.name} (${branch.id}) is fully complete!`);
      }
    }
    console.log(`\nTotal missing branch-days: ${totalMissingBranchDays}`);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
