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
    const res = await query('order_flows', 'select', { select: 'id, name, branches, updated_at, active, flow_type, description, supplier_id, receiver_scope' });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.error(e);
  }
}
main();
