import pg from 'pg';
import fs from 'fs';
import path from 'path';

// 1. Prepare copy of files resolving Vite path aliases
const settingsSrc = fs.readFileSync(path.resolve('src/lib/demoSalesSettings.js'), 'utf8');
const generatorSrc = fs.readFileSync(path.resolve('src/lib/demoSalesGenerator.js'), 'utf8');

// Replace Vite path alias with relative path
const patchedGeneratorSrc = generatorSrc.replace(
  /from\s+['"]@\/lib\/demoSalesSettings['"]/g,
  "from './demoSalesSettings.js'"
);

fs.writeFileSync(path.resolve('scratch/demoSalesSettings.js'), settingsSrc, 'utf8');
fs.writeFileSync(path.resolve('scratch/demoSalesGenerator.js'), patchedGeneratorSrc, 'utf8');

// Now import the generator functions dynamically
const { prepareDemoGeneration, buildBranchDayReceipts, findFastSalesChannel } = await import('./demoSalesGenerator.js');
const { DEFAULT_DEMO_SALES_SETTINGS } = await import('./demoSalesSettings.js');

// 2. Load DB Connection
const envContent = fs.readFileSync(path.resolve('server/.env'), 'utf8');
const dbUrlMatch = envContent.match(/DATABASE_URL=(.*)/);
if (!dbUrlMatch) {
  console.error('DATABASE_URL not found in server/.env');
  process.exit(1);
}
const connectionString = dbUrlMatch[1].trim();

const client = new pg.Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

function chunkArray(list, size) {
  const chunks = [];
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size));
  }
  return chunks;
}

async function insertRows(client, tableName, rows, chunkSize) {
  for (const chunk of chunkArray(rows, chunkSize)) {
    if (!chunk.length) continue;
    
    const columns = Object.keys(chunk[0]);
    const values = [];
    const valPlaceholders = [];
    let valIndex = 1;
    
    for (const row of chunk) {
      const placeholders = [];
      for (const col of columns) {
        const val = row[col];
        if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
          values.push(JSON.stringify(val));
        } else if (Array.isArray(val)) {
          values.push(JSON.stringify(val));
        } else {
          values.push(val);
        }
        placeholders.push(`$${valIndex++}`);
      }
      valPlaceholders.push(`(${placeholders.join(', ')})`);
    }
    
    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${valPlaceholders.join(',\n')}
    `;
    
    await client.query(query, values);
  }
}

async function run() {
  await client.connect();
  console.log('Connected to Railway Postgres.');

  const targetDate = '2026-05-26';
  const targetBranchName = 'Kadıköy Şubesi';
  const targetBranchId = '4e488f4b-669d-4279-8f0d-0fd382fe1d87';

  try {
    // A. Query Branch and Hiearchy Details
    const branchRes = await client.query(`
      SELECT 
        id as "branchId",
        name as "branchName",
        parent_id
      FROM company_nodes 
      WHERE id = $1
    `, [targetBranchId]);

    if (branchRes.rows.length === 0) {
      throw new Error(`Branch not found for ID: ${targetBranchId}`);
    }

    const branchRow = branchRes.rows[0];

    // Build the full parent hierarchy
    const allNodesRes = await client.query('SELECT id, name, type, parent_id FROM company_nodes');
    const nodesMap = new Map(allNodesRes.rows.map(n => [n.id, n]));

    let companyId = null, companyName = null;
    let legalEntityId = null, legalEntityName = null;
    let orgUnitId = null, orgUnitName = null;

    let curr = nodesMap.get(branchRow.parent_id);
    while (curr) {
      if (curr.type === 'sirket') {
        companyId = curr.id;
        companyName = curr.name;
      } else if (curr.type === 'tuzel') {
        legalEntityId = curr.id;
        legalEntityName = curr.name;
      } else if (curr.type === 'org') {
        orgUnitId = curr.id;
        orgUnitName = curr.name;
      }
      curr = nodesMap.get(curr.parent_id);
    }

    const branchCtx = {
      branchId: branchRow.branchId,
      branchName: branchRow.branchName,
      companyId,
      companyName,
      legalEntityId,
      legalEntityName,
      orgUnitId,
      orgUnitName
    };

    console.log('Branch Context Resolved:', branchCtx);

    // B. Query active sales channels
    const channelRes = await client.query(`
      SELECT id, name, active
      FROM sales_channels
      WHERE active = true AND deleted_at IS NULL
    `);

    if (channelRes.rows.length === 0) {
      throw new Error('No active sales channels found in database.');
    }
    const channel = findFastSalesChannel(channelRes.rows);
    if (!channel) {
      throw new Error('Active fast sales channel could not be resolved.');
    }
    console.log('Sales Channel Chosen:', channel);

    // C. Query items, categories, taxes, stock, semi
    console.log('Fetching catalog tables...');
    const productsRes = await client.query(`
      SELECT id, sku, name, deleted_at, sale_status, setting_active, standard_price, portions, option_groups, channel_prices, sale_cat_l1, sale_cat_l2, sale_cat_l3, sale_cat_l4, sale_cat_l5, recipe_rows, recipe_output_qty
      FROM sale_items
      WHERE deleted_at IS NULL AND sale_status = true AND setting_active = true
      ORDER BY name
    `);

    const categoriesRes = await client.query(`
      SELECT id, name, parent_id, deleted_at
      FROM sale_categories
      WHERE deleted_at IS NULL
      ORDER BY name
    `);

    const taxesRes = await client.query(`
      SELECT id, name, rate, deleted_at
      FROM taxes
      WHERE deleted_at IS NULL
      ORDER BY rate
    `);

    const stockRes = await client.query(`
      SELECT id, name, sku, unit FROM stock_items WHERE deleted_at IS NULL ORDER BY name
    `);

    const semiRes = await client.query(`
      SELECT id, name, sku, recipe_output_unit FROM semi_items WHERE deleted_at IS NULL ORDER BY name
    `);

    console.log(`Fetched ${productsRes.rows.length} products, ${categoriesRes.rows.length} categories, ${taxesRes.rows.length} taxes, ${stockRes.rows.length} stock items, ${semiRes.rows.length} semi items.`);

    // D. Clean up existing demo sales for this branch and date
    console.log(`Cleaning up existing demo sales for Kadıköy on ${targetDate}...`);
    const existingSalesRes = await client.query(`
      SELECT id FROM sales 
      WHERE integration_ref = 'demo-sales-tool' 
        AND branch_id = $1 
        AND sale_datetime >= $2::timestamptz 
        AND sale_datetime <= $3::timestamptz
    `, [targetBranchId, `${targetDate}T00:00:00+03:00`, `${targetDate}T23:59:59+03:00`]);

    const existingIds = existingSalesRes.rows.map(r => r.id);
    if (existingIds.length > 0) {
      console.log(`Found ${existingIds.length} existing demo sales. Deleting...`);
      await client.query('BEGIN');

      // Fetch movement IDs that will be deleted
      const movementsRes = await client.query(
        "SELECT id FROM inventory_movements WHERE source_doc_type = 'sale' AND source_doc_id = ANY($1)",
        [existingIds]
      );
      const movementIds = movementsRes.rows.map(r => r.id);

      if (movementIds.length > 0) {
        console.log(`Clearing source_movement_id in recalc jobs referencing ${movementIds.length} movements...`);
        await client.query(
          "UPDATE inventory_movement_recalc_jobs SET source_movement_id = NULL WHERE source_movement_id = ANY($1)",
          [movementIds]
        );
      }

      await client.query('ALTER TABLE inventory_movements DISABLE TRIGGER ALL');
      await client.query('DELETE FROM inventory_movements WHERE source_doc_type = \'sale\' AND source_doc_id = ANY($1)', [existingIds]);
      await client.query('ALTER TABLE inventory_movements ENABLE TRIGGER ALL');
      await client.query('DELETE FROM sale_payments WHERE sale_id = ANY($1)', [existingIds]);
      await client.query('DELETE FROM sale_lines WHERE sale_id = ANY($1)', [existingIds]);
      await client.query('DELETE FROM sales WHERE id = ANY($1)', [existingIds]);
      await client.query('COMMIT');
      console.log('Cleanup completed.');
    } else {
      console.log('No existing demo sales found for this date.');
    }

    // E. Prepare Demo Generator and Receipts
    const generator = prepareDemoGeneration({
      branches: [branchCtx],
      products: productsRes.rows,
      categories: categoriesRes.rows,
      taxes: taxesRes.rows,
      channel,
      settings: DEFAULT_DEMO_SALES_SETTINGS,
      stockItems: stockRes.rows,
      semiItems: semiRes.rows
    });

    console.log('Generator configured. Generating receipts...');
    const receipts = buildBranchDayReceipts({
      branch: branchCtx,
      isoDay: targetDate,
      existingCount: 0,
      generator
    });

    console.log(`Generated ${receipts.length} receipts.`);

    if (receipts.length === 0) {
      console.log('No receipts generated (possibly due to weekday weights or limits).');
      return;
    }

    const salesRows = receipts.map(r => r.header);
    const saleLineRows = receipts.flatMap(r => r.lines);
    const paymentRows = receipts.flatMap(r => r.payments);
    
    // Map candidates to movement rows
    // To support pending inventory movements calculations correctly
    const balanceState = new Map();
    const movementCandidates = receipts.flatMap(r => r.movementCandidates || []);
    
    // Helper function to apply movement balance similar to useDemoSalesJob
    const movementRows = movementCandidates.map(candidate => {
      const branchKey = `id:${candidate.branchId}`;
      const key = `${candidate.itemType}:${candidate.stockItemId || ''}:${candidate.semiItemId || ''}:${branchKey}`;
      const prev = balanceState.get(key) || { qty: 0, totalCost: 0, avgCost: 0 };
      const nextQty = prev.qty - Number(candidate.quantity || 0);
      const movementUnitCost = Number(candidate.unitCost || prev.avgCost || 0);
      const movementTotalCost = movementUnitCost * Number(candidate.quantity || 0);
      const nextTotalCost = prev.totalCost - movementTotalCost;
      const nextAvgCost = nextQty > 0 ? (nextTotalCost / nextQty) : movementUnitCost;
      balanceState.set(key, { qty: nextQty, totalCost: nextTotalCost, avgCost: nextAvgCost });

      return {
        company_id: candidate.companyId || null,
        legal_entity_id: candidate.legalEntityId || null,
        org_unit_id: candidate.orgUnitId || null,
        branch_id: candidate.branchId || null,
        branch_name: candidate.branchName || null,
        item_type: candidate.itemType,
        stock_item_id: candidate.stockItemId || null,
        semi_item_id: candidate.semiItemId || null,
        item_name: candidate.itemName,
        item_sku: candidate.itemSku || null,
        unit: candidate.unit || null,
        movement_type: 'sale_consumption',
        source_doc_type: 'sale',
        direction: 'out',
        movement_at: candidate.movementAt,
        quantity: candidate.quantity,
        source_doc_id: candidate.saleId,
        source_doc_line_id: candidate.saleLineId,
        sale_id: candidate.saleId,
        sale_line_id: candidate.saleLineId,
        sale_item_id: candidate.saleItemId || null,
        sales_channel_id: candidate.salesChannelId || null,
        sales_channel_name: candidate.salesChannelName || null,
        portion_id: candidate.portionId || null,
        portion_name: candidate.portionName || null,
        recipe_row_id: candidate.recipeRowId || null,
        unit_cost: movementUnitCost,
        total_cost: movementTotalCost,
        avg_unit_cost_after: nextAvgCost,
        balance_qty_after: nextQty,
        balance_total_cost_after: nextTotalCost,
        calc_status: 'pending',
        notes: candidate.note || null,
        meta: candidate.meta || {},
      };
    });

    console.log(`Inserting into database: ${salesRows.length} sales, ${saleLineRows.length} lines, ${paymentRows.length} payments, ${movementRows.length} inventory movements...`);

    await client.query('BEGIN');
    await insertRows(client, 'sales', salesRows, 20);
    await insertRows(client, 'sale_lines', saleLineRows, 40);
    await insertRows(client, 'sale_payments', paymentRows, 30);
    await insertRows(client, 'inventory_movements', movementRows, 60);
    await client.query('COMMIT');

    const totalRevenue = salesRows.reduce((sum, r) => sum + Number(r.gross_total_after_discount), 0);

    console.log('SUCCESS! Demo sales generated successfully.');
    console.log(`Summary:`);
    console.log(`- Date: ${targetDate}`);
    console.log(`- Branch: ${targetBranchName} (${targetBranchId})`);
    console.log(`- Total Sales Created: ${salesRows.length}`);
    console.log(`- Total Sale Lines Created: ${saleLineRows.length}`);
    console.log(`- Total Payments Created: ${paymentRows.length}`);
    console.log(`- Total Inventory Movements Created: ${movementRows.length}`);
    console.log(`- Total Gross Revenue: ${totalRevenue.toFixed(2)} TRY`);

  } catch (err) {
    console.error('Error occurred, rolling back if in transaction...');
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
