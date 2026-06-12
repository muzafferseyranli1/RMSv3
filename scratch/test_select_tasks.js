import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  const branchId = '302bd195-3b79-4f14-a60b-4668c36a12c1'; // Pendik Merkez Depo

  // Insert a mock task
  const insertRes = await client.query(`
    INSERT INTO warehouse_tasks (
      branch_id,
      task_type,
      status,
      priority,
      description,
      meta
    ) VALUES (
      $1,
      'putaway',
      'pending',
      'normal',
      'Test Putaway Task',
      $2
    ) RETURNING *
  `, [
    branchId,
    JSON.stringify({
      product_id: 'b0e10001-0000-4000-8000-000000000001',
      barcode: 'STK-DN-01',
      product_code: 'STK-DN-01',
      product_name: 'Hamburger Ekmeği',
      quantity: 10,
      scanned_quantity: 2,
      source_location: 'Z1',
      target_location: 'Z9',
      target_location_id: '61eda94b-c634-4229-ae00-ea14ae5c595b'
    })
  ]);

  const inserted = insertRes.rows[0];
  console.log('Inserted task:', inserted);

  // Now, hit the local or production API to select from warehouse_tasks
  const apiRes = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table: 'warehouse_tasks',
      operation: 'select',
      select: '*',
      limit: 1
    })
  });
  const apiData = await apiRes.json();
  console.log('API select response:', apiData.data);

  // Clean up
  await client.query('DELETE FROM warehouse_tasks WHERE id = $1', [inserted.id]);

  await client.end();
}

main().catch(console.error);
