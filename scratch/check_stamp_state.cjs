const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';
const customerId = 'd8d3477f-1fba-4171-be4d-703285c47004';

async function run() {
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.\n');

  // 1. Active stamp rules + action_json
  const rules = await client.query(`
    SELECT id, campaign_id, action_type, action_json, condition_key, condition_json
    FROM loyalty_campaign_rules
    WHERE active = true AND condition_key IN ('period_product_quantity', 'period_order_count')
  `);
  console.log('=== ACTIVE STAMP RULES ===');
  for (const r of rules.rows) {
    console.log(`  Rule ${r.id} | Campaign: ${r.campaign_id}`);
    console.log(`  action_type: ${r.action_type}`);
    console.log(`  action_json: ${JSON.stringify(r.action_json)}`);
    console.log(`  condition_json: ${JSON.stringify(r.condition_json)}`);
    console.log('');
  }

  // 2. Current frequency progress for customer
  const progress = await client.query(`
    SELECT id, campaign_id, program_id, progress_type, current_count, target_count, completed_cycles, metadata
    FROM loyalty_frequency_progress
    WHERE customer_id = $1
  `, [customerId]);
  console.log('=== FREQUENCY PROGRESS ===');
  for (const p of progress.rows) {
    console.log(`  Campaign: ${p.campaign_id} | Type: ${p.progress_type}`);
    console.log(`  current=${p.current_count} / target=${p.target_count} | cycles=${p.completed_cycles}`);
    console.log('');
  }

  // 3. Reward entitlements for this customer
  const ents = await client.query(`
    SELECT id, entitlement_type, entitlement_status, title, reward_payload, earned_at
    FROM loyalty_reward_entitlements
    WHERE customer_id = $1
    ORDER BY earned_at DESC
    LIMIT 10
  `, [customerId]);
  console.log('=== REWARD ENTITLEMENTS ===');
  if (ents.rows.length === 0) {
    console.log('  (none)');
  }
  for (const e of ents.rows) {
    console.log(`  ${e.earned_at} | type=${e.entitlement_type} | status=${e.entitlement_status} | title=${e.title}`);
    console.log(`  payload: ${JSON.stringify(e.reward_payload)}`);
    console.log('');
  }

  // 4. Recent sale lines for this customer (last 10)
  const sales = await client.query(`
    SELECT sh.id, sh.sale_datetime, sl.product_name, sl.quantity
    FROM sale_headers sh
    JOIN sale_lines sl ON sl.sale_id = sh.id
    WHERE sh.customer_id = $1
    ORDER BY sh.sale_datetime DESC
    LIMIT 20
  `, [customerId]);
  console.log('=== RECENT SALE LINES ===');
  for (const s of sales.rows) {
    console.log(`  ${s.sale_datetime} | ${s.product_name} x${s.quantity} (sale: ${s.id})`);
  }

  await client.end();
}

run().catch(console.error);
