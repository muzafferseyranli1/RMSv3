async function main() {
  try {
    const response = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'pos_terminals',
        operation: 'select',
        select: 'id, device_type, screen_mode, activation_code, terminal_name',
        filters: [{ type: 'order', col: 'created_at', ascending: false }, { type: 'limit', val: 20 }]
      })
    });
    const result = await response.json();
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e);
  }
}
main();
