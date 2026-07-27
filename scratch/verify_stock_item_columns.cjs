const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    console.log('Connecting to database...');
    // 1. Get a random stock item
    const res = await pool.query('SELECT id, name FROM public.stock_items LIMIT 1;');
    if (res.rows.length === 0) {
      console.log('No stock items found.');
      return;
    }
    const item = res.rows[0];
    console.log(`Testing with item: ${item.name} (${item.id})`);

    // 2. Update columns
    const testWarehouses = JSON.stringify(['302bd195-3b79-4f14-a60b-4668c36a12c1']);
    const testKitchens = JSON.stringify(['dfe6fa32-847d-4d9f-9782-032e50bf94ec']);

    await pool.query(`
      UPDATE public.stock_items
      SET is_central_warehouse_good = true,
          central_warehouses = $1,
          is_central_kitchen_good = true,
          central_kitchens = $2
      WHERE id = $3;
    `, [testWarehouses, testKitchens, item.id]);
    console.log('Update query run successfully.');

    // 3. Verify values
    const verifyRes = await pool.query(`
      SELECT is_central_warehouse_good, central_warehouses, is_central_kitchen_good, central_kitchens
      FROM public.stock_items
      WHERE id = $1;
    `, [item.id]);
    
    const verified = verifyRes.rows[0];
    console.log('Verified row values:');
    console.log(verified);

    if (verified.is_central_warehouse_good === true &&
        verified.is_central_kitchen_good === true &&
        JSON.stringify(verified.central_warehouses) === JSON.stringify(['302bd195-3b79-4f14-a60b-4668c36a12c1']) &&
        JSON.stringify(verified.central_kitchens) === JSON.stringify(['dfe6fa32-847d-4d9f-9782-032e50bf94ec'])) {
      console.log('COLUMN VERIFICATION SUCCESSFUL!');
    } else {
      console.error('VERIFICATION FAILED: values do not match.');
    }

    // 4. Revert
    await pool.query(`
      UPDATE public.stock_items
      SET is_central_warehouse_good = false,
          central_warehouses = '[]'::jsonb,
          is_central_kitchen_good = false,
          central_kitchens = '[]'::jsonb
      WHERE id = $1;
    `, [item.id]);
    console.log('Reverted test item values.');

  } catch (err) {
    console.error('Verification script failed:', err);
  } finally {
    await pool.end();
  }
}

main();
