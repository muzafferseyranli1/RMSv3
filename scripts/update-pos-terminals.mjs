import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway'
});

async function run() {
  await client.connect();
  
  // Create columns if they don't exist
  try {
    await client.query(`
      ALTER TABLE pos_terminals 
      ADD COLUMN IF NOT EXISTS pair_key VARCHAR(20) UNIQUE,
      ADD COLUMN IF NOT EXISTS device_type VARCHAR(20) DEFAULT 'pos',
      ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS config_data JSONB DEFAULT '{}'::jsonb;
    `);
    console.log("Columns added successfully");
    
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pos_terminals'");
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
