const { Client } = require('pg');

const connectionString = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    // Query employees from settings table
    const settingsRes = await client.query(`
      SELECT value FROM public.settings WHERE key = 'personnel_records';
    `);
    const employees = settingsRes.rows[0]?.value || [];
    const hq = employees.filter(e => e.authorityLevel === 'Genel Merkez');
    console.log('HQ Employees:');
    console.log(hq.map(e => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      authorityLevel: e.authorityLevel,
      defaultBranchId: e.defaultBranchId
    })));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
