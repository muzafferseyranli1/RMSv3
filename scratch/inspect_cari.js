import pg from 'pg';

const NEW_PG_URL = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function inspectCari() {
  const pool = new pg.Pool({ connectionString: NEW_PG_URL });
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'cari_hareketler' 
    ORDER BY ordinal_position;
  `);
  console.log('cari_hareketler columns:', res.rows);
  await pool.end();
}

inspectCari();
