const { Client } = require('pg');
const DATABASE_URL = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: false });
  await client.connect();

  // Find Kiosk channel ID
  const channelRes = await client.query("SELECT id, name FROM sales_channels WHERE name ILIKE 'kiosk' AND deleted_at IS NULL LIMIT 1;");
  const kioskChannel = channelRes.rows[0];
  if (!kioskChannel) {
    console.error("Kiosk channel not found!");
    await client.end();
    return;
  }
  const channelId = kioskChannel.id;
  console.log(`Kiosk Channel Found: Name='${kioskChannel.name}', ID='${channelId}'`);

  // Fetch all categories
  const catRes = await client.query('SELECT id, name, parent_id FROM sale_categories WHERE deleted_at IS NULL;');
  const categories = catRes.rows;
  const catMap = new Map(categories.map(c => [c.id, c]));

  // Helper to find root category ID
  function getRootCategoryId(catId) {
    let curr = catMap.get(catId);
    if (!curr) return null;
    while (curr.parent_id) {
      const parent = catMap.get(curr.parent_id);
      if (!parent) break;
      curr = parent;
    }
    return curr.id;
  }

  // Fetch all items
  const itemsRes = await client.query('SELECT id, name, active, deleted_at, channel_prices, sale_cat_l1, sale_cat_l2, sale_cat_l3, sale_cat_l4, sale_cat_l5 FROM sale_items WHERE deleted_at IS NULL;');
  const items = itemsRes.rows;

  console.log(`Total active items in database: ${items.length}`);

  // Group items by root category
  const rootStats = {};
  // Initialize stats for all roots
  const roots = categories.filter(c => !c.parent_id);
  for (const r of roots) {
    rootStats[r.id] = {
      name: r.name,
      totalItems: 0,
      activeItems: 0,
      hasKioskPrice: 0,
      kioskActiveItems: 0
    };
  }

  for (const item of items) {
    // Get all category IDs associated with this item
    const itemCatIds = [item.sale_cat_l1, item.sale_cat_l2, item.sale_cat_l3, item.sale_cat_l4, item.sale_cat_l5].filter(Boolean);
    
    // Find the unique root categories this item belongs to
    const itemRoots = new Set();
    for (const catId of itemCatIds) {
      const rId = getRootCategoryId(catId);
      if (rId) itemRoots.add(rId);
    }

    // Check kiosk price
    let hasPrice = false;
    let isActivePrice = false;
    if (item.channel_prices) {
      // channel_prices is JSONB, could be array or object
      const prices = Array.isArray(item.channel_prices) ? item.channel_prices : [];
      const match = prices.find(p => p.channel_id === channelId);
      if (match) {
        hasPrice = parseFloat(match.price) > 0;
        isActivePrice = match.active !== false;
      }
    }

    for (const rId of itemRoots) {
      const stats = rootStats[rId];
      if (stats) {
        stats.totalItems++;
        if (item.active) {
          stats.activeItems++;
        }
        if (hasPrice) {
          stats.hasKioskPrice++;
          if (item.active && isActivePrice) {
            stats.kioskActiveItems++;
          }
        }
      }
    }
  }

  console.log('\nCategory Stats for Kiosk:');
  console.log(JSON.stringify(rootStats, null, 2));

  await client.end();
}

main().catch(console.error);
