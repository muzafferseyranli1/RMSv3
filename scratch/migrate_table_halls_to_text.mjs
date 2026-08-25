import pg from 'pg';
const { Client } = pg;

async function migrate() {
  const client = new Client({
    connectionString: 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway',
    ssl: false,
  });

  try {
    await client.connect();
    console.log('Connected to VPS PostgreSQL.');

    // 1. Drop foreign keys
    console.log('1. Dropping foreign keys...');
    await client.query(`
      ALTER TABLE public.table_service_requests DROP CONSTRAINT IF EXISTS table_service_requests_table_id_fkey;
      ALTER TABLE public.table_feedback DROP CONSTRAINT IF EXISTS table_feedback_table_id_fkey;
      ALTER TABLE public.pos_tables DROP CONSTRAINT IF EXISTS pos_tables_hall_id_fkey;
      ALTER TABLE public.pos_tables DROP CONSTRAINT IF EXISTS pos_tables_section_id_fkey;
      ALTER TABLE public.pos_table_sections DROP CONSTRAINT IF EXISTS pos_table_sections_hall_id_fkey;
    `);

    // 2. Alter column types to TEXT
    console.log('2. Altering column types to TEXT...');
    await client.query(`
      ALTER TABLE public.pos_table_halls ALTER COLUMN id TYPE TEXT USING id::text;
      ALTER TABLE public.pos_table_halls ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

      ALTER TABLE public.pos_table_sections ALTER COLUMN id TYPE TEXT USING id::text;
      ALTER TABLE public.pos_table_sections ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
      ALTER TABLE public.pos_table_sections ALTER COLUMN hall_id TYPE TEXT USING hall_id::text;

      ALTER TABLE public.pos_tables ALTER COLUMN id TYPE TEXT USING id::text;
      ALTER TABLE public.pos_tables ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
      ALTER TABLE public.pos_tables ALTER COLUMN hall_id TYPE TEXT USING hall_id::text;
      ALTER TABLE public.pos_tables ALTER COLUMN section_id TYPE TEXT USING section_id::text;

      ALTER TABLE public.table_service_requests ALTER COLUMN table_id TYPE TEXT USING table_id::text;
      ALTER TABLE public.table_feedback ALTER COLUMN table_id TYPE TEXT USING table_id::text;
    `);

    // 3. Re-add foreign keys
    console.log('3. Re-adding foreign keys...');
    await client.query(`
      ALTER TABLE public.pos_table_sections ADD CONSTRAINT pos_table_sections_hall_id_fkey 
        FOREIGN KEY (hall_id) REFERENCES public.pos_table_halls(id) ON DELETE CASCADE;
      
      ALTER TABLE public.pos_tables ADD CONSTRAINT pos_tables_hall_id_fkey 
        FOREIGN KEY (hall_id) REFERENCES public.pos_table_halls(id) ON DELETE CASCADE;

      ALTER TABLE public.pos_tables ADD CONSTRAINT pos_tables_section_id_fkey 
        FOREIGN KEY (section_id) REFERENCES public.pos_table_sections(id) ON DELETE CASCADE;

      ALTER TABLE public.table_service_requests ADD CONSTRAINT table_service_requests_table_id_fkey 
        FOREIGN KEY (table_id) REFERENCES public.pos_tables(id) ON DELETE CASCADE;

      ALTER TABLE public.table_feedback ADD CONSTRAINT table_feedback_table_id_fkey 
        FOREIGN KEY (table_id) REFERENCES public.pos_tables(id) ON DELETE CASCADE;
    `);

    console.log('✅ Successfully migrated all table catalog columns to TEXT IDs in VPS DB!');

  } catch (err) {
    console.error('❌ Migration Error:', err);
  } finally {
    await client.end();
  }
}

migrate();
