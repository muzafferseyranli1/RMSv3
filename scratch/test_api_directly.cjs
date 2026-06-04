const API_URL = 'https://rms-api-production-219d.up.railway.app';

async function testQuery(table) {
  const body = {
    table,
    operation: 'select',
    select: 'id,name,sku',
    filters: [
      { type: 'is', col: 'deleted_at', val: null },
      { type: 'order', col: 'name', ascending: true }
    ]
  };

  try {
    const response = await fetch(`${API_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    console.log(`Table ${table} query result:`, result.error || `Fetched ${result.data?.length || 0} rows successfully.`);
    if (result.data && result.data.length > 0) {
      console.log(`First row:`, result.data[0]);
    }
  } catch (err) {
    console.error(`Error querying table ${table}:`, err.message);
  }
}

async function main() {
  await testQuery('stock_items');
  await testQuery('sale_items');
  await testQuery('semi_items');
}

main();
