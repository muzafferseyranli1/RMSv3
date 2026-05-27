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

    // Query all company_nodes
    const nodesRes = await client.query(`
      SELECT id, name, type, parent_id, can_sell 
      FROM public.company_nodes;
    `);
    console.log('\n--- COMPANY NODES FROM DB ---');
    console.log(nodesRes.rows);

  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await client.end();
  }
}

main();
