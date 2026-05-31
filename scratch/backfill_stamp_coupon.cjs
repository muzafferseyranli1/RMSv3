/**
 * Backfill script: 
 * - Customer has 6 Sütlü Kahve (RPC confirms product_quantity = 6)
 * - Target is 5 per cycle → completed_cycles = 1, current = 1
 * - Set progress to 1/5, cycles=1
 * - Issue a free coffee coupon from series coupon-series-mpjl0u8zzlmg2
 * - Create a loyalty_reward_entitlement record
 */
const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';
const customerId = 'd8d3477f-1fba-4171-be4d-703285c47004';
const campaignId = 'campaign-mpl0qzbb7sya2n';
const seriesId = 'coupon-series-mpjl0u8zzlmg2';

function randCode(prefix = 'KAHVE', length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = prefix;
  while (code.length < length) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function run() {
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.\n');

  // 1. Update frequency progress → 1/5, cycles=1
  const existing = await client.query(
    `SELECT id FROM loyalty_frequency_progress WHERE customer_id = $1 AND campaign_id = $2 AND progress_type = 'products'`,
    [customerId, campaignId]
  );

  const targetCount = 5;
  const actualCount = 6;
  const completedCycles = Math.floor(actualCount / targetCount); // 1
  const currentCount = actualCount % targetCount; // 1
  const metadata = JSON.stringify({
    lastSourceRefId: 'manual_backfill_6_coffees',
    period: 'all_time',
    lastActualCount: actualCount
  });

  if (existing.rows.length > 0) {
    await client.query(`
      UPDATE loyalty_frequency_progress
      SET current_count = $1, target_count = $2, completed_cycles = $3,
          last_qualified_at = NOW(), metadata = $4::jsonb, updated_at = NOW()
      WHERE id = $5
    `, [currentCount, targetCount, completedCycles, metadata, existing.rows[0].id]);
    console.log(`✅ Progress updated: ${currentCount}/${targetCount}, cycles=${completedCycles}`);
  } else {
    console.log('No existing progress row found — skipping update (unexpected).');
  }

  // 2. Check if coupon series exists
  const seriesRes = await client.query(
    `SELECT id, name, code_prefix, code_length FROM loyalty_coupon_series WHERE id = $1`,
    [seriesId]
  );
  if (seriesRes.rows.length === 0) {
    console.error('ERROR: Coupon series not found:', seriesId);
    await client.end();
    return;
  }
  const series = seriesRes.rows[0];
  console.log(`Series: ${series.name} (prefix: ${series.code_prefix})`);

  // 3. Check if there's already an available coupon in this series for this customer
  const existingCoupon = await client.query(
    `SELECT id, code FROM loyalty_coupons WHERE series_id = $1 AND customer_id = $2 AND is_used = false AND active = true`,
    [seriesId, customerId]
  );
  
  let couponCode;
  if (existingCoupon.rows.length > 0) {
    couponCode = existingCoupon.rows[0].code;
    console.log(`✅ Customer already has coupon for this series: ${couponCode}`);
  } else {
    // 4. Generate new coupon code
    let newCode;
    let attempts = 0;
    do {
      newCode = randCode(series.code_prefix || 'KPHV', series.code_length || 8);
      const check = await client.query(`SELECT id FROM loyalty_coupons WHERE code = $1`, [newCode]);
      if (check.rows.length === 0) break;
      attempts++;
    } while (attempts < 10);

    const couponId = `coupon-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await client.query(`
      INSERT INTO loyalty_coupons (id, series_id, customer_id, code, is_used, active, redemption_status, created_at, updated_at, metadata)
      VALUES ($1, $2, $3, $4, false, true, 'available', NOW(), NOW(), $5::jsonb)
    `, [couponId, seriesId, customerId, newCode, JSON.stringify({ generatedBy: 'manual_backfill', seriesName: series.name })]);
    couponCode = newCode;
    console.log(`✅ Coupon created: ${couponCode}`);

    // Update series coupon count
    await client.query(
      `UPDATE loyalty_coupon_series SET coupon_count = coupon_count + 1, updated_at = NOW() WHERE id = $1`,
      [seriesId]
    );
  }

  // 5. Check if entitlement already exists for this cycle
  const existingEnt = await client.query(
    `SELECT id FROM loyalty_reward_entitlements WHERE customer_id = $1 AND campaign_id = $2 AND entitlement_type = 'coupon'`,
    [customerId, campaignId]
  );

  if (existingEnt.rows.length > 0) {
    console.log('✅ Reward entitlement already exists:', existingEnt.rows[0].id);
  } else {
    const entId = `ent-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await client.query(`
      INSERT INTO loyalty_reward_entitlements (
        id, customer_id, campaign_id, entitlement_type, entitlement_status,
        title, description, source_channel, source_ref_id, source_ref_no,
        target_scope_type, target_scope_json, reward_payload, quantity, earned_at, metadata
      )
      VALUES ($1, $2, $3, 'coupon', 'available',
              '5 Kahve Tamamlandı - Ücretsiz Kahve', 'Damga kampanyası tamamlandı',
              'pos', 'manual_backfill_6_coffees', 'manual_backfill_6_coffees',
              'any', '{}'::jsonb,
              $4::jsonb,
              1, NOW(), $5::jsonb)
    `, [
      entId,
      customerId,
      campaignId,
      JSON.stringify({ seriesId, couponCode, type: 'issue_coupon', value: seriesId }),
      JSON.stringify({ createdBy: 'manual_backfill', couponCode })
    ]);
    console.log(`✅ Reward entitlement created: ${entId}`);
  }

  console.log('\n=== FINAL STATE ===');
  const finalProgress = await client.query(
    `SELECT current_count, target_count, completed_cycles FROM loyalty_frequency_progress WHERE customer_id = $1 AND campaign_id = $2`,
    [customerId, campaignId]
  );
  console.log('Progress:', finalProgress.rows[0]);
  console.log('Coupon code:', couponCode);

  await client.end();
}

run().catch(console.error);
