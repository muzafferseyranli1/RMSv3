const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';
const customerId = 'd8d3477f-1fba-4171-be4d-703285c47004';
const campaignId = 'campaign-mpl0qzbb7sya2n';
const seriesId = 'coupon-series-mpjl0u8zzlmg2';

function randNumericCode(prefix, randomLength) {
  const digits = '0123456789';
  let code = prefix;
  for (let i = 0; i < randomLength; i++) {
    code += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return code;
}

async function run() {
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.\n');

  // 1. Müşteriye zaten bu seride bir kupon var mı?
  const existingCoupon = await client.query(
    `SELECT id, code FROM loyalty_coupons WHERE series_id = $1 AND customer_id = $2 AND is_used = false AND active = true AND deleted_at IS NULL`,
    [seriesId, customerId]
  );

  let couponCode;
  if (existingCoupon.rows.length > 0) {
    couponCode = existingCoupon.rows[0].code;
    console.log(`✅ Müşterinin zaten kuponu var: ${couponCode}`);
  } else {
    // 2. Benzersiz kod üret
    let newCode;
    let attempts = 0;
    do {
      newCode = randNumericCode('KHV', 4);
      const check = await client.query(`SELECT id FROM loyalty_coupons WHERE code = $1`, [newCode]);
      if (check.rows.length === 0) break;
      attempts++;
    } while (attempts < 20);

    const couponId = `coupon-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    // loyalty_coupons kolon adlarını kontrol et
    const couponCols = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'loyalty_coupons' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    console.log('loyalty_coupons kolonları:', couponCols.rows.map(r => r.column_name).join(', '));

    await client.query(`
      INSERT INTO loyalty_coupons (
        id, series_id, customer_id, code, is_used, active, redemption_status,
        created_at, updated_at, metadata
      )
      VALUES ($1, $2, $3, $4, false, true, 'available', NOW(), NOW(), $5::jsonb)
    `, [
      couponId, seriesId, customerId, newCode,
      JSON.stringify({ generatedBy: 'backfill_stamp_6_coffees', seriesName: 'Ücretsiz Kahve' })
    ]);
    couponCode = newCode;
    console.log(`✅ Kupon oluşturuldu: ${couponCode}`);

    // Seri sayacını artır
    await client.query(
      `UPDATE loyalty_coupon_series SET coupon_count = coupon_count + 1, updated_at = NOW() WHERE id = $1`,
      [seriesId]
    );
  }

  // 3. Reward entitlement var mı kontrol et
  const existingEnt = await client.query(
    `SELECT id FROM loyalty_reward_entitlements WHERE customer_id = $1 AND campaign_id = $2 AND entitlement_type = 'coupon'`,
    [customerId, campaignId]
  );

  if (existingEnt.rows.length > 0) {
    console.log('✅ Entitlement zaten mevcut:', existingEnt.rows[0].id);
  } else {
    const entId = `ent-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    // entitlement kolon adlarını kontrol et
    const entCols = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'loyalty_reward_entitlements' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    console.log('loyalty_reward_entitlements kolonları:', entCols.rows.map(r => r.column_name).join(', '));

    await client.query(`
      INSERT INTO loyalty_reward_entitlements (
        id, customer_id, campaign_id, entitlement_type, entitlement_status,
        title, description, source_channel, source_ref_id, source_ref_no,
        target_scope_type, target_scope_json, reward_payload, quantity, earned_at, metadata
      )
      VALUES ($1, $2, $3, 'coupon', 'available',
              '5 Kahve Tamamlandı - Ücretsiz Kahve',
              '5 Sütlü Kahve satın alarak ücretsiz kahve kazandınız!',
              'pos', 'backfill_stamp_6_coffees', 'backfill_stamp_6_coffees',
              'any', '{}'::jsonb,
              $4::jsonb,
              1, NOW(), $5::jsonb)
    `, [
      entId, customerId, campaignId,
      JSON.stringify({ seriesId, couponCode, type: 'issue_coupon', value: seriesId }),
      JSON.stringify({ createdBy: 'backfill_stamp_6_coffees', couponCode })
    ]);
    console.log(`✅ Reward entitlement oluşturuldu: ${entId}`);
  }

  // 4. Final durum
  const finalProgress = await client.query(
    `SELECT current_count, target_count, completed_cycles FROM loyalty_frequency_progress WHERE customer_id = $1 AND campaign_id = $2`,
    [customerId, campaignId]
  );
  console.log('\n=== FINAL DURUM ===');
  console.log('Progress:', finalProgress.rows[0]);
  console.log('Kupon kodu:', couponCode);
  console.log('✅ Tamamlandı!');

  await client.end();
}

run().catch(console.error);
