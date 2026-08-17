const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  const pool = new Pool({ connectionString, ssl: false });
  try {
    const res = await pool.query(`SELECT id, activation_code, device_type, screen_mode, terminal_name, config_data FROM pos_terminals;`);
    console.log('All devices in pos_terminals:', res.rows);
    const kdsOnly = res.rows.filter(r => r.device_type === 'kds' || r.screen_mode === 'kds' || r.device_type === 'kitchen');
    console.log('KDS devices only:', kdsOnly);
  } catch (err) {
    console.error('Err:', err);
  } finally {
    await pool.end();
  }
}
main();
