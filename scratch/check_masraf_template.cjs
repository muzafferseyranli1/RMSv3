const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway' });

async function run() {
  await client.connect();
  try {
    const res = await client.query("SELECT id, title, form_type, allowed_contexts, schema_json FROM form_templates WHERE deleted_at IS NULL");
    console.log("=== Form Templates ===");
    res.rows.forEach(row => {
      console.log(`ID: ${row.id}`);
      console.log(`Title: ${row.title}`);
      console.log(`Form Type: ${row.form_type}`);
      console.log(`Allowed Contexts:`, row.allowed_contexts);
      console.log(`Schema JSON task_config:`, row.schema_json?.task_config);
      console.log("------------------------");
    });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
