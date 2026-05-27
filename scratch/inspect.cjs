const { Client } = require('pg');

const connectionString = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB.');

    // Query employees from settings table
    const settingsRes = await client.query(`
      SELECT key, value 
      FROM public.settings 
      WHERE key = 'personnel_records';
    `);
    console.log('\n--- EMPLOYEES FROM SETTINGS ---');
    const employees = settingsRes.rows[0]?.value || [];
    console.log(employees.map(e => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      authorityLevel: e.authorityLevel,
      defaultBranchId: e.defaultBranchId,
      managedBranchIds: e.managedBranchIds
    })));

  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await client.end();
  }
}

main();
