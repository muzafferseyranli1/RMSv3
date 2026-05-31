async function run() {
  try {
    const pRes = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'loyalty_frequency_progress',
        operation: 'select',
        filters: [{ type: 'eq', col: 'customer_id', val: 'd8d3477f-1fba-4171-be4d-703285c47004' }]
      })
    }).then(r => r.json());

    console.log('--- FREQUENCY PROGRESS FOR CUSTOMER ---');
    console.log(JSON.stringify(pRes.data, null, 2));

  } catch (e) {
    console.error(e);
  }
}

run();
