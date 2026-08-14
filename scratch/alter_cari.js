import pg from 'pg';

const NEW_PG_URL = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function alterCari() {
  const pool = new pg.Pool({ connectionString: NEW_PG_URL });
  console.log('Adding supplier_id to cari_hareketler...');
  try {
    await pool.query(`
      ALTER TABLE public.cari_hareketler ADD COLUMN IF NOT EXISTS supplier_id UUID;
    `);
    console.log('✅ supplier_id column added to cari_hareketler!');
  } catch (err) {
    console.error('Error altering cari_hareketler:', err);
  } finally {
    await pool.end();
  }
}

alterCari();
