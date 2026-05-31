async function run() {
  const customerId = 'd8d3477f-1fba-4171-be4d-703285c47004';
  const ruleId = 'rule-mpl0qzbb9z40r0';

  try {
    const ruleRes = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'loyalty_campaign_rules',
        operation: 'select',
        filters: [{ type: 'eq', col: 'id', val: ruleId }]
      })
    }).then(r => r.json());

    const rule = ruleRes.data?.[0];
    if (!rule) {
      console.log('Rule not found!');
      return;
    }

    const config = rule.condition_json || {};
    const period = String(config.period || 'all_time');
    const periodDays = parseInt(config.periodDays || 30, 10);
    const productMasks = config.productMasks || [];
    const excludeFreeItems = Boolean(config.excludeFreeItems);
    const allowSameItemRepeat = config.allowSameItemRepeat !== false;

    // To bypass the cache, we can pass a dummy parameter or change timezone, or we can just wait. But passing a dummy field in POST body will change the cache key!
    console.log('--- TEST 7: Sending p_sales_channel as pos and bypassing cache ---');
    try {
      const rpcRes = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rpc: 'get_customer_period_stats',
          params: {
            p_customer_id: customerId,
            p_period: period,
            p_period_days: periodDays,
            p_product_masks: JSON.stringify(productMasks),
            p_exclude_free_items: excludeFreeItems,
            p_allow_same_item_repeat: allowSameItemRepeat,
            p_current_product_ids: [],
            p_sales_channel: 'pos'
          },
          bypassCache: Date.now() // Changes body so that cacheKey is completely different!
        })
      }).then(r => r.json());
      console.log(JSON.stringify(rpcRes, null, 2));
    } catch (e) {
      console.error(e);
    }

  } catch (e) {
    console.error(e);
  }
}

run();
