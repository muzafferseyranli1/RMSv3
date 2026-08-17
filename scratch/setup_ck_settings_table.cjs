const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  const pool = new Pool({ connectionString, ssl: false });
  try {
    const ddl = `
      CREATE TABLE IF NOT EXISTS public.cloud_kitchen_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        separate_warehouses BOOLEAN DEFAULT false,
        separate_profitability BOOLEAN DEFAULT false,
        separate_personnel BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    await pool.query(ddl);

    // Insert default single row if not exists
    const check = await pool.query('SELECT * FROM cloud_kitchen_settings LIMIT 1;');
    if (check.rows.length === 0) {
      await pool.query(`
        INSERT INTO cloud_kitchen_settings (separate_warehouses, separate_profitability, separate_personnel)
        VALUES (false, false, false);
      `);
    }

    const current = await pool.query('SELECT * FROM cloud_kitchen_settings LIMIT 1;');
    console.log('cloud_kitchen_settings row:', current.rows[0]);
  } catch (err) {
    console.error('Err:', err);
  } finally {
    await pool.end();
  }
}
main();
