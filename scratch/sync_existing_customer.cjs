const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function run() {
  const customerId = 'd8d3477f-1fba-4171-be4d-703285c47004';
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB.');

    // 1. Get active stamp rules
    const rulesRes = await client.query(`
      SELECT id, campaign_id, condition_key, condition_json
      FROM loyalty_campaign_rules
      WHERE active = true AND condition_key IN ('period_product_quantity', 'period_order_count')
    `);

    const rules = rulesRes.rows;
    console.log(`Found ${rules.length} active stamp rules.`);

    for (const rule of rules) {
      console.log(`Processing rule: ${rule.id} for campaign: ${rule.campaign_id}`);
      
      const campRes = await client.query('SELECT program_id FROM loyalty_campaigns WHERE id = $1', [rule.campaign_id]);
      const programId = campRes.rows[0]?.program_id;
      if (!programId) {
        console.log(`Program ID not found for campaign ${rule.campaign_id}, skipping.`);
        continue;
      }
      console.log(`Program ID found: ${programId}`);
      
      const config = typeof rule.condition_json === 'string' ? JSON.parse(rule.condition_json) : (rule.condition_json || {});
      const period = String(config.period || 'all_time');
      const periodDays = parseInt(config.periodDays || 30, 10);
      const productMasks = config.productMasks || [];
      const excludeFreeItems = Boolean(config.excludeFreeItems);
      const allowSameItemRepeat = config.allowSameItemRepeat !== false;

      let targetCount = 0;
      let progressType = 'orders';

      if (rule.condition_key === 'period_product_quantity') {
        progressType = 'products';
        targetCount = Math.max(0, parseInt(config.quantity || 0, 10));
      } else {
        progressType = 'orders';
        targetCount = Math.max(0, parseInt(config.count || 0, 10));
      }

      // Call the DB RPC function get_customer_period_stats
      console.log('Calling get_customer_period_stats...');
      const rpcRes = await client.query({
        text: 'SELECT * FROM public.get_customer_period_stats($1, $2, $3, $4, $5, $6, $7, $8)',
        values: [
          customerId,
          period,
          periodDays,
          JSON.stringify(productMasks),
          excludeFreeItems,
          allowSameItemRepeat,
          [],
          'pos'
        ]
      });

      const stats = rpcRes.rows[0];
      console.log('Stats retrieved:', stats);

      if (stats) {
        const actualCount = Number(
          rule.condition_key === 'period_product_quantity'
            ? stats.product_quantity
            : stats.order_count
        );

        const completedCycles = targetCount > 0 ? Math.floor(actualCount / targetCount) : 0;
        const currentCount = targetCount > 0 ? (actualCount % targetCount) : 0;
        const completedNow = targetCount > 0 && actualCount > 0 && (actualCount % targetCount === 0);

        console.log(`Actual Count: ${actualCount}, Current: ${currentCount}, Target: ${targetCount}, Cycles: ${completedCycles}`);

        const metadata = {
          lastSourceRefId: 'manual_backfill',
          period,
          periodDays,
          lastActualCount: actualCount
        };

        // Check if progress row exists
        const checkRes = await client.query(
          'SELECT id FROM loyalty_frequency_progress WHERE customer_id = $1 AND campaign_id = $2 AND progress_type = $3',
          [customerId, rule.campaign_id, progressType]
        );

        if (checkRes.rows.length > 0) {
          console.log('Updating existing progress row...');
          await client.query(`
            UPDATE loyalty_frequency_progress
            SET current_count = $1,
                target_count = $2,
                completed_cycles = $3,
                last_qualified_at = $4,
                metadata = $5,
                updated_at = NOW()
            WHERE id = $6
          `, [
            currentCount,
            targetCount,
            completedCycles,
            new Date().toISOString(),
            JSON.stringify(metadata),
            checkRes.rows[0].id
          ]);
        } else {
          console.log('Inserting new progress row...');
          await client.query(`
            INSERT INTO loyalty_frequency_progress (
              customer_id, program_id, campaign_id, progress_type,
              current_count, target_count, completed_cycles,
              last_qualified_at, metadata, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          `, [
            customerId,
            programId,
            rule.campaign_id,
            progressType,
            currentCount,
            targetCount,
            completedCycles,
            new Date().toISOString(),
            JSON.stringify(metadata)
          ]);
        }
        console.log('Progress successfully synced!');
      }
    }

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
