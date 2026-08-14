import pg from 'pg';

const OLD_API = 'http://161.156.83.133:3001/api/query';
const NEW_PG_URL = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function queryOldApi(body) {
  const res = await fetch(OLD_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return await res.json();
}

async function main() {
  console.log('--- Testing Query to Old API (161.156.83.133:3001/api/query) ---');

  const newPool = new pg.Pool({ connectionString: NEW_PG_URL, connectionTimeoutMillis: 5000 });

  // Get all tables present in the new VPS postgres
  const allTablesRes = await newPool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  const tables = allTablesRes.rows.map(r => r.table_name);

  console.log(`Found ${tables.length} tables in PostgreSQL schema. Checking data on OLD vs NEW server...\n`);

  const summary = [];

  for (const table of tables) {
    let oldCount = 0;
    let oldErr = null;
    let sampleOldData = null;

    try {
      const oRes = await queryOldApi({
        table,
        operation: 'select',
        select: '*',
      });
      if (oRes.data) {
        oldCount = oRes.data.length;
        if (oldCount > 0) sampleOldData = oRes.data[0];
      } else if (oRes.error) {
        oldErr = oRes.error.message;
      }
    } catch (e) {
      oldErr = e.message;
    }

    let newCount = 0;
    let newErr = null;
    try {
      const nRes = await newPool.query(`SELECT count(*) FROM public."${table}"`);
      newCount = parseInt(nRes.rows[0].count);
    } catch (e) {
      newErr = e.message;
    }

    summary.push({ table, oldCount, newCount, oldErr, newErr });

    const diffMarker = (oldCount > 0 && newCount === 0) ? '🔴 MISSING IN NEW!' : (oldCount !== newCount ? '🟡 COUNT DIFF' : '🟢 SYNCED');
    console.log(`${diffMarker.padEnd(20)} | Table: ${table.padEnd(30)} | Old: ${String(oldCount).padStart(5)} | New: ${String(newCount).padStart(5)} ${oldErr ? `(OldErr: ${oldErr.slice(0, 30)})` : ''}`);
  }

  await newPool.end();

  const missingTables = summary.filter(s => s.oldCount > 0 && s.newCount === 0);
  console.log(`\n=== SUMMARY: ${missingTables.length} tables have data on Old VPS but 0 rows on New VPS! ===`);
  missingTables.forEach(m => console.log(` - ${m.table}: ${m.oldCount} rows on Old VPS`));
}

main().catch(console.error);
