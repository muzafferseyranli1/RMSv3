import pg from 'pg';
import fs from 'fs';
import path from 'path';

// Parse server/.env manually
const envPath = 'C:\\RMSv3\\server\\.env';
const envContent = fs.readFileSync(envPath, 'utf8');
let databaseUrl = '';
for (const line of envContent.split('\n')) {
  if (line.trim().startsWith('DATABASE_URL=')) {
    databaseUrl = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function run() {
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    console.log('Testing simple inserts to pinpoint invalid json syntax...');
    
    // Test 1: sales insert with stringified json
    try {
      console.log('Testing sales insert with stringified json...');
      await client.query(`
        INSERT INTO sales (
          local_id, sale_datetime, source, status, gross_total_before_discount, 
          gross_total_after_discount, net_total_after_discount, cost_total, payment_total, change_amount,
          loyalty_applied_actions_json, loyalty_decision_context_json
        ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        'test-local-id-1', 'pos', 'completed', 100, 100, 100, 50, 100, 0,
        '[{"type":"discount"}]', // loyalty_applied_actions_json
        '{"combinedEarnMultiplier": 1}' // loyalty_decision_context_json
      ]);
      console.log('Test 1 Passed!');
    } catch (e) {
      console.error('Test 1 Failed:', e.message, e.detail, e.hint);
    }

    // Test 2: sales insert with raw object (what happened before our fix if it wasn't stringified)
    try {
      console.log('Testing sales insert with raw object (passed as object)...');
      // Node-pg handles objects by converting them to string, but how? Let's check
      await client.query(`
        INSERT INTO sales (
          local_id, sale_datetime, source, status, gross_total_before_discount, 
          gross_total_after_discount, net_total_after_discount, cost_total, payment_total, change_amount,
          loyalty_applied_actions_json
        ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        'test-local-id-2', 'pos', 'completed', 100, 100, 100, 50, 100, 0,
        { type: 'discount' } // raw object
      ]);
      console.log('Test 2 Passed!');
    } catch (e) {
      console.error('Test 2 Failed:', e.message, e.detail, e.hint);
    }

    // Test 3: sale_lines insert with options_json as array of objects
    try {
      console.log('Testing sale_lines insert with options_json as array of objects...');
      // options_json is jsonb. Let's see what happens if we pass array of objects
      await client.query(`
        INSERT INTO sale_lines (
          id, sale_id, line_no, product_id, product_name, qty, unit_gross_before_discount,
          line_gross_before_discount, unit_gross_after_discount, line_gross_after_discount,
          line_net_after_discount, tax_rate, unit_cost_snapshot, line_cost_total, options_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 1,
        '00000000-0000-0000-0000-000000000003', 'Product A', 1, 100, 100, 100, 100, 100, 8, 50, 50,
        [{ id: '1', name: 'Option' }] // array of objects
      ]);
      console.log('Test 3 Passed!');
    } catch (e) {
      console.error('Test 3 Failed:', e.message);
    }

    // Test 4: sale_lines insert with stringified options_json array
    try {
      console.log('Testing sale_lines insert with stringified options_json...');
      await client.query(`
        INSERT INTO sale_lines (
          id, sale_id, line_no, product_id, product_name, qty, unit_gross_before_discount,
          line_gross_before_discount, unit_gross_after_discount, line_gross_after_discount,
          line_net_after_discount, tax_rate, unit_cost_snapshot, line_cost_total, options_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 1,
        '00000000-0000-0000-0000-000000000003', 'Product A', 1, 100, 100, 100, 100, 100, 8, 50, 50,
        JSON.stringify([{ id: '1', name: 'Option' }]) // stringified array
      ]);
      console.log('Test 4 Passed!');
    } catch (e) {
      console.error('Test 4 Failed:', e.message);
    }

    // Clean up test records
    await client.query("DELETE FROM sale_lines WHERE id IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004')");
    await client.query("DELETE FROM sales WHERE local_id IN ('test-local-id-1', 'test-local-id-2')");
    
  } catch (err) {
    console.error('Unexpected outer error:', err);
  } finally {
    await client.end();
  }
}
run();
