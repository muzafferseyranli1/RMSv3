async function main() {
  try {
    const response = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'settings',
        operation: 'select',
        select: 'key, value',
        filters: [{ type: 'eq', col: 'key', val: 'kiosk_settings_v2' }]
      })
    });
    const result = await response.json();
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e);
  }
}
main();
