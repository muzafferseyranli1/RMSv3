const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway'
  });

  try {
    await client.connect();

    // 1. Sale Items (Active products)
    const saleItemsRes = await client.query(`
      SELECT id, name, sku 
      FROM public.sale_items 
      WHERE active = true AND deleted_at IS NULL
      ORDER BY name ASC
    `);
    const totalSaleItems = saleItemsRes.rows;

    const manualSaleItemsRes = await client.query(`
      SELECT DISTINCT linked_item_id 
      FROM public.manual_pages 
      WHERE linked_item_type = 'sale_item' AND is_draft = false
    `);
    const linkedSaleItemIds = new Set(manualSaleItemsRes.rows.map(r => r.linked_item_id));

    // 2. Stock Items
    const stockItemsRes = await client.query(`
      SELECT id, name, sku 
      FROM public.stock_items 
      WHERE deleted_at IS NULL
      ORDER BY name ASC
    `);
    const totalStockItems = stockItemsRes.rows;

    const manualStockItemsRes = await client.query(`
      SELECT DISTINCT linked_item_id 
      FROM public.manual_pages 
      WHERE linked_item_type = 'stock_item' AND is_draft = false
    `);
    const linkedStockItemIds = new Set(manualStockItemsRes.rows.map(r => r.linked_item_id));

    console.log('--- PRODUCTS (SALE ITEMS) MANUAL COVERAGE ---');
    console.log(`Total active products: ${totalSaleItems.length}`);
    console.log(`Products with manuals: ${linkedSaleItemIds.size}`);
    console.log(`Products without manuals: ${totalSaleItems.length - linkedSaleItemIds.size}`);
    
    const unmappedProducts = totalSaleItems.filter(item => !linkedSaleItemIds.has(item.id));
    if (unmappedProducts.length > 0) {
      console.log('Unmapped Products Sample:');
      unmappedProducts.slice(0, 15).forEach(p => console.log(` - [${p.sku || 'No SKU'}] ${p.name}`));
      if (unmappedProducts.length > 15) {
        console.log(`   ... and ${unmappedProducts.length - 15} more.`);
      }
    }

    console.log('\n--- STOCK ITEMS MANUAL COVERAGE ---');
    console.log(`Total stock items: ${totalStockItems.length}`);
    console.log(`Stock items with manuals: ${linkedStockItemIds.size}`);
    console.log(`Stock items without manuals: ${totalStockItems.length - linkedStockItemIds.size}`);

    const unmappedStocks = totalStockItems.filter(item => !linkedStockItemIds.has(item.id));
    if (unmappedStocks.length > 0) {
      console.log('Unmapped Stock Items Sample:');
      unmappedStocks.slice(0, 15).forEach(s => console.log(` - [${s.sku || 'No SKU'}] ${s.name}`));
      if (unmappedStocks.length > 15) {
        console.log(`   ... and ${unmappedStocks.length - 15} more.`);
      }
    }

  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await client.end();
  }
}

main();
