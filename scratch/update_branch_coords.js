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
    console.log("Current Tree fetched. Nodes count at root:", currentTree.length);

    // Helper to recursively update branch coordinates
    function updateBranchCoords(nodes) {
      for (const node of nodes) {
        if (node.type === 'sube') {
          if (node.name.includes("Kadıköy") || node.name.includes("Kadikoy")) {
            node.latitude = 41.028595;
            node.longitude = 29.177221;
            console.log(`Updated ${node.name} coordinates to 41.028595, 29.177221`);
          } else {
            // Assign some default approximate coordinates in Istanbul (near Kadikoy/Uskudar/Umraniye)
            node.latitude = 41.012345;
            node.longitude = 29.123456;
            console.log(`Updated other branch ${node.name} to approximate coordinates`);
          }
        }
        if (node.children && node.children.length > 0) {
          updateBranchCoords(node.children);
        }
      }
    }

    updateBranchCoords(currentTree);

    // 2) Save back the company_tree using 'data' property
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
