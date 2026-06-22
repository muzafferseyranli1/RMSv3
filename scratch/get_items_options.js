async function main() {
  try {
    const response = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'sale_items',
        operation: 'select',
        select: 'id, name, option_groups',
        filters: [{ type: 'limit', val: 100 }]
      })
    });
    const result = await response.json();
    const itemsWithOptions = (result.data || []).filter(item => item.option_groups && item.option_groups.length > 0);
    console.log(`Found ${itemsWithOptions.length} items with options:`);
    console.log(JSON.stringify(itemsWithOptions.slice(0, 5), null, 2));
  } catch (e) {
    console.error(e);
  }
}
main();
