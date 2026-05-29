const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway' });

async function run() {
  await client.connect();
  try {
    const res = await client.query("SELECT value FROM settings WHERE key = 'personnel_records'");
    if (res.rows.length > 0) {
      const records = res.rows[0].value;
      const simplified = records.map(r => ({ name: r.firstName, pin: r.pin }));
      console.log("Records:", JSON.stringify(simplified, null, 2));
    } else {
      console.log("No personnel_records found in settings.");
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}
run();
