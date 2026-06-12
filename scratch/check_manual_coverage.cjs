const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway'
  });

  try {
    await client.connect();

    const pagesRes = await client.query(`
      SELECT p.id, p.title, p.linked_item_type, p.linked_item_id, c.name as category_name
      FROM public.manual_pages p
      LEFT JOIN public.manual_categories c ON p.category_id = c.id
      ORDER BY c.name, p.title
    `);
    
    console.log('--- ALL MANUAL PAGES IN DATABASE ---');
    console.log(`Total manual pages: ${pagesRes.rows.length}`);
    pagesRes.rows.forEach((p, idx) => {
      console.log(`${idx + 1}. Title: "${p.title}" | Category: "${p.category_name}" | Linked Type: ${p.linked_item_type} | Linked ID: ${p.linked_item_id}`);
    });

  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await client.end();
  }
}

main();
