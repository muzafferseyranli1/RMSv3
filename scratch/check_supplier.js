async function query(table, operation, body = {}) {
  const response = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table, operation, ...body })
  });
  return await response.json();
}

async function main() {
  try {
    const res = await query('suppliers', 'select', {
      select: 'id, name, active, deleted_at, supplier_kind',
      filters: [{ type: 'eq', col: 'id', val: 'f2e16624-f10a-4a2b-9cf9-3a746c631e4a' }]
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.error(e);
  }
}
main();
