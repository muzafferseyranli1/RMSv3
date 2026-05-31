const { Client } = require('pg');
const { randomUUID } = require('crypto');

const databaseUrl = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';
const customerId = 'd8d3477f-1fba-4171-be4d-703285c47004';
const campaignId = 'campaign-mpl0qzbb7sya2n';
const seriesId = 'coupon-series-mpjl0u8zzlmg2';
const couponCode = 'KHV2088'; // az önce oluşturulan kupon

async function run() {
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.\n');

  // Entitlement zaten var mı?
  const existingEnt = await client.query(
    `SELECT id FROM loyalty_reward_entitlements WHERE customer_id = $1 AND campaign_id = $2 AND entitlement_type = 'coupon'`,
    [customerId, campaignId]
  );

  if (existingEnt.rows.length > 0) {
    console.log('✅ Entitlement zaten mevcut:', existingEnt.rows[0].id);
  } else {
    const entId = randomUUID(); // standart UUID

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

  // Final durum
  const progress = await client.query(
    `SELECT current_count, target_count, completed_cycles FROM loyalty_frequency_progress WHERE customer_id = $1 AND campaign_id = $2`,
    [customerId, campaignId]
  );
  const coupon = await client.query(
    `SELECT id, code, redemption_status FROM loyalty_coupons WHERE customer_id = $1 AND series_id = $2 AND is_used = false`,
    [customerId, seriesId]
  );
  const ents = await client.query(
    `SELECT id, entitlement_type, entitlement_status, title FROM loyalty_reward_entitlements WHERE customer_id = $1 AND campaign_id = $2`,
    [customerId, campaignId]
  );

  console.log('\n=== FINAL DURUM ===');
  console.log('Progress:', progress.rows[0]);
  console.log('Kupon:', coupon.rows[0]);
  console.log('Entitlement:', ents.rows[0]);
  console.log('\n✅ Loyalty durumu başarıyla düzeltildi!');

  await client.end();
}

run().catch(console.error);
