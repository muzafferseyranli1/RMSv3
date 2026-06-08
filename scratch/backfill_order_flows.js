import pg from 'pg';
const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is missing.");
  process.exit(1);
}

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB.');

    // 1. Backfill order_flows.flow_channel based on linked supplier's kind
    console.log('Running backfill query...');
    const result = await client.query(`
      UPDATE public.order_flows ofl
      SET flow_channel = CASE 
          WHEN sup.supplier_kind = 'internal_warehouse' THEN 'warehouse_replenishment'
          WHEN sup.supplier_kind = 'internal_kitchen' THEN 'kitchen_replenishment'
          ELSE 'external_purchase'
      END
      FROM public.suppliers sup
      WHERE ofl.supplier_id = sup.id;
    `);
    console.log(`Backfill query completed. Rows affected: ${result.rowCount}`);

    // 2. Fetch updated records to verify
    const verifyRes = await client.query(`
      SELECT ofl.id, ofl.name, ofl.flow_channel, sup.name as supplier_name, sup.supplier_kind
      FROM public.order_flows ofl
      LEFT JOIN public.suppliers sup ON ofl.supplier_id = sup.id;
    `);
    console.log('\nVerification of Updated Order Flows:');
    console.log(verifyRes.rows);

  } catch (err) {
    console.error('Error during backfill:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
