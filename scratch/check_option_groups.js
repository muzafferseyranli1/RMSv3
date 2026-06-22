async function main() {
  try {
    const response = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'option_groups',
        operation: 'select',
        select: 'id, name, options',
        filters: [{ type: 'limit', val: 50 }]
      })
    });
    const result = await response.json();
    console.log(`Found ${result.data ? result.data.length : 0} option groups:`);
    console.log(JSON.stringify(result.data, null, 2));
  } catch (e) {
    console.error(e);
  }
}
main();
