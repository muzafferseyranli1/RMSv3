import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway',
    ssl: false,
  });
  await client.connect();
  console.log('Connected to VPS DB.');
  
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  
  const importantTables = [
    'sales', 'sale_lines', 'sale_items', 'orders', 'order_items', 'products', 
    'stock_items', 'inventory_movements', 'branches', 'company_nodes', 
    'personnel_records', 'categories', 'customers', 'settings'
  ];

  console.log('\n--- Important Tables Status ---');
  for (const t of importantTables) {
    const exists = tablesRes.rows.some(r => r.table_name === t);
    if (!exists) {
      console.log(`❌ Table '${t}': DOES NOT EXIST`);
    } else {
      const cnt = await client.query(`SELECT COUNT(*) FROM public."${t}";`);
      console.log(`✅ Table '${t}': EXISTS (${cnt.rows[0].count} rows)`);
    }
  }

  await client.end();
}

main();
