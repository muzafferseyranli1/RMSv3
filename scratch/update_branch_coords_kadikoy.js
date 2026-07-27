async function main() {
  try {
    // 1) Fetch current company_tree
    const fetchRes = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'settings',
        operation: 'select',
        filters: [{ type: 'eq', col: 'key', val: 'company_tree' }]
      })
    });
    const fetchJson = await fetchRes.json();
    const currentTree = fetchJson.data?.[0]?.value || [];
    
    let updated = false;
    // Helper to recursively update branch coordinates
    function updateBranchCoords(nodes) {
      for (const node of nodes) {
        if (node.id === '4e488f4b-669d-4279-8f0d-0fd382fe1d87') {
          node.latitude = 40.97430147484319;
          node.longitude = 29.100421395681053;
          console.log(`Updating ${node.name} coordinates to 40.97430147484319, 29.100421395681053`);
          updated = true;
        }
        if (node.children && node.children.length > 0) {
          updateBranchCoords(node.children);
        }
      }
    }

    updateBranchCoords(currentTree);

    if (!updated) {
      console.error("Kadıköy branch not found by ID!");
      return;
    }

    // 2) Save back the company_tree
    const saveRes = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'settings',
        operation: 'upsert',
        data: { key: 'company_tree', value: currentTree }
      })
    });
    const saveJson = await saveRes.json();
    console.log("Save Result:", JSON.stringify(saveJson, null, 2));

  } catch (e) {
    console.error("Error updating branch coordinates:", e);
  }
}
main();
