import pkg from 'pg';
import crypto from 'crypto';
const { Client } = pkg;

const DATABASE_URL = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function verify() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL successfully.');

    // 1. Fetch some active stock items, sale items, semi items, and branches
    const stockRes = await client.query("SELECT id, name, sku FROM stock_items WHERE deleted_at IS NULL LIMIT 3");
    console.log(`Fetched ${stockRes.rowCount} stock items.`);
    stockRes.rows.forEach(r => console.log(` - Stock: ${r.name} (${r.sku || 'No SKU'})`));

    const saleRes = await client.query("SELECT id, name, sku FROM sale_items WHERE deleted_at IS NULL LIMIT 3");
    console.log(`Fetched ${saleRes.rowCount} sale items.`);
    saleRes.rows.forEach(r => console.log(` - Sale: ${r.name} (${r.sku || 'No SKU'})`));

    const semiRes = await client.query("SELECT id, name, sku FROM semi_items WHERE deleted_at IS NULL LIMIT 3");
    console.log(`Fetched ${semiRes.rowCount} semi items.`);
    semiRes.rows.forEach(r => console.log(` - Semi: ${r.name} (${r.sku || 'No SKU'})`));

    // Notice we fetch from company_nodes where type = 'sube'
    const branchRes = await client.query("SELECT id, name FROM company_nodes WHERE type = 'sube' LIMIT 3");
    console.log(`Fetched ${branchRes.rowCount} branches.`);
    branchRes.rows.forEach(r => console.log(` - Branch: ${r.name}`));

    // Prepare simulated selections
    const selectedStock = stockRes.rows.map(r => ({ id: r.id, name: r.name }));
    const selectedSale = saleRes.rows.map(r => ({ id: r.id, name: r.name }));
    const selectedSemi = semiRes.rows.map(r => ({ id: r.id, name: r.name }));
    const selectedBranch = branchRes.rows.map(r => ({ id: r.id, name: r.name }));

    // 2. Insert a test Form Template
    const templateId = crypto.randomUUID();
    const templateTitle = 'Test Dynamic Fields Template ' + Date.now();
    const schemaJson = {
      sections: [
        {
          id: 'section_1',
          name: 'Genel Değerlendirme',
          fields: [
            { id: 'field_stock', type: 'stock_item_select', label: 'Stok Seçimi', required: true, max_points: 10 },
            { id: 'field_sale', type: 'sale_item_select', label: 'Satış Seçimi', required: false, max_points: 5 },
            { id: 'field_semi', type: 'semi_product_select', label: 'Yarı Mamul Seçimi', required: false, max_points: 5 },
            { id: 'field_branch', type: 'branch_select', label: 'Şube Seçimi', required: true, max_points: 10 }
          ]
        }
      ]
    };

    console.log('Inserting test form template with ID:', templateId);
    const insertTemplateRes = await client.query(
      `INSERT INTO form_templates (id, title, form_type, schema_json, scoring, target_branches, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *`,
      [
        templateId,
        templateTitle,
        'checklist',
        JSON.stringify(schemaJson),
        JSON.stringify({ enabled: true }),
        JSON.stringify([]),
      ]
    );
    const template = insertTemplateRes.rows[0];
    console.log('Inserted template title:', template.title);

    // 3. Prepare answers json simulating user input
    const answersJson = [
      { field_id: 'field_stock', value: selectedStock },
      { field_id: 'field_sale', value: selectedSale },
      { field_id: 'field_semi', value: selectedSemi },
      { field_id: 'field_branch', value: selectedBranch }
    ];

    // 4. Submit form response
    const submissionId = crypto.randomUUID();
    console.log('Inserting test form submission with ID:', submissionId);
    const insertSubRes = await client.query(
      `INSERT INTO form_submissions (id, template_id, branch_id, answers_json, total_score, max_possible_score, submitted_by, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
      [
        submissionId,
        template.id,
        branchRes.rows[0]?.id || crypto.randomUUID(), // Valid branch UUID or new UUID
        JSON.stringify(answersJson),
        25, // Score calculation (10+5+5+5)
        30, // Max score
        'a2760b9d-3b6f-43e1-90ef-a8823f0270e9', // Dummy user
        'completed'
      ]
    );
    const submission = insertSubRes.rows[0];
    console.log('Inserted submission ID:', submission.id);

    // 5. Query submission back and verify formatting logic
    console.log('Retrieving submission back for verification...');
    const readSubRes = await client.query(
      `SELECT * FROM form_submissions WHERE id = $1`,
      [submission.id]
    );
    const retrievedSub = readSubRes.rows[0];
    const retrievedAnswers = retrievedSub.answers_json;

    console.log('Retrieved answers_json payload:');
    console.log(JSON.stringify(retrievedAnswers, null, 2));

    // Verify format maps
    retrievedAnswers.forEach(ans => {
      const field = schemaJson.sections[0].fields.find(f => f.id === ans.field_id);
      let displayValue = '—';
      if (field && (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select')) {
        if (Array.isArray(ans.value)) {
          displayValue = ans.value.map(item => item.name).join(', ') || '—';
        }
      }
      console.log(`Field Type: ${field.type} | Label: ${field.label} | Display Value: "${displayValue}"`);
    });

    // 6. Clean up test records
    console.log('Cleaning up test records...');
    await client.query('DELETE FROM form_submissions WHERE id = $1', [submission.id]);
    await client.query('DELETE FROM form_templates WHERE id = $1', [template.id]);
    console.log('Cleanup completed successfully.');

    console.log('\n--- VERIFICATION RESULT: SUCCESS ---');
  } catch (err) {
    console.error('Verification failed with error:', err);
  } finally {
    await client.end();
  }
}

verify();
