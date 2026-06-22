// Use global fetch

async function main() {
  const body = {
    table: 'sale_categories',
    operation: 'select',
    select: 'id,name,parent_id,image_url',
    nullFilters: ['deleted_at'],
    orderBy: { column: 'name', ascending: true }
  };

  const response = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const json = await response.json();
  if (json.error) {
    console.error(json.error);
    return;
  }

  console.log(`API returned ${json.data.length} categories.`);
  console.log('Roots:');
  const roots = json.data.filter(c => !c.parent_id);
  console.log(JSON.stringify(roots, null, 2));
}

main().catch(console.error);
