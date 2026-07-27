async function main() {
  try {
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
    
    function findKadikoy(nodes) {
      for (const node of nodes) {
        if (node.name && (node.name.includes("Kadıköy") || node.name.includes("Kadikoy"))) {
          console.log("Found Kadikoy:", JSON.stringify(node, null, 2));
        }
        if (node.children) {
          findKadikoy(node.children);
        }
      }
    }
    findKadikoy(currentTree);
  } catch (e) {
    console.error("Error reading tree:", e);
  }
}
main();
