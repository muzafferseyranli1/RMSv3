const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway' });

async function run() {
  await client.connect();
  try {
    const res = await client.query("SELECT value FROM settings WHERE key = 'positions'");
    if (res.rows.length > 0) {
      console.log("Positions:", JSON.stringify(res.rows[0].value, null, 2));
    } else {
      console.log("No positions found in settings.");
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}
run();
