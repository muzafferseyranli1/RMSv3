const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway' });

async function run() {
  await client.connect();
  try {
    const res = await client.query("SELECT * FROM public.settings WHERE key = 'account_chart'");
    if (res.rows.length === 0) {
      console.log("No account_chart setting found!");
    } else {
      console.log("Found account_chart:", JSON.stringify(res.rows[0], null, 2));
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}
run();
