async function run() {
  try {
    const res = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'form_templates',
        operation: 'select',
        select: 'id, title, form_type, active, deleted_at'
      })
    }).then(r => r.json());

    console.log('--- ALL FORM TEMPLATES ---');
    console.log(JSON.stringify(res.data, null, 2));

  } catch (e) {
    console.error(e);
  }
}
run();
