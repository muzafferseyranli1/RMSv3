import pg from 'pg';
const { Client } = pg;

async function findFks() {
  const client = new Client({
    connectionString: 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway',
    ssl: false,
  });

  await client.connect();
  const res = await client.query(`
    SELECT
      tc.table_schema, 
      tc.constraint_name, 
      tc.table_name, 
      kcu.column_name, 
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name 
    FROM 
      information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND ccu.table_name IN ('pos_table_halls', 'pos_table_sections', 'pos_tables');
  `);

  console.log('Foreign keys referencing pos_tables/halls/sections:');
  console.log(res.rows);
  await client.end();
}

findFks();
