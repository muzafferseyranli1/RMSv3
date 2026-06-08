async function main() {
  try {
    const response = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'workflow_definitions',
        operation: 'select',
        select: 'id, name, workflow_type, status, version',
        filters: []
      })
    });
    const result = await response.json();
    console.log("Workflow Definitions:", JSON.stringify(result, null, 2));

    const instResponse = await fetch('https://rms-api-production-219d.up.railway.app/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'workflow_instances',
        operation: 'select',
        select: 'id, definition_id, current_node_id, status, started_by',
        filters: []
      })
    });
    const instResult = await instResponse.json();
    console.log("Workflow Instances:", JSON.stringify(instResult, null, 2));
  } catch (e) {
    console.error(e);
  }
}
main();
