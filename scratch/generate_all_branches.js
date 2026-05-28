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

if (!fs.existsSync('scratch')) {
  fs.mkdirSync('scratch');
}
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

  const startDateStr = '2026-05-15';
  const endDateStr = '2026-05-29';

  // Generate target dates array
  const dates = [];
  let currDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  while (currDate <= endDate) {
    dates.push(currDate.toISOString().split('T')[0]);
    currDate.setDate(currDate.getDate() + 1);
  }

  try {
    // A. Query branches and build hierarchy contexts
    const allNodesRes = await client.query('SELECT id, name, type, parent_id FROM company_nodes');
    const nodesMap = new Map(allNodesRes.rows.map(n => [n.id, n]));
    
    const branches = allNodesRes.rows.filter(n => n.type === 'sube');
    const branchContexts = [];

    for (const branchRow of branches) {
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

      branchContexts.push({
        branchId: branchRow.id,
        branchName: branchRow.name,
        companyId,
        companyName,
        legalEntityId,
        legalEntityName,
        orgUnitId,
        orgUnitName
      });
    }

    console.log(`Resolved contexts for ${branchContexts.length} branches.`);

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
    console.log('Sales Channel Chosen:', channel.name);

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

    console.log(`Catalog: ${productsRes.rows.length} products, ${categoriesRes.rows.length} categories, ${taxesRes.rows.length} taxes, ${stockRes.rows.length} stock, ${semiRes.rows.length} semi.`);

    // D. Configure Generator
    const generator = prepareDemoGeneration({
      branches: branchContexts,
      products: productsRes.rows,
      categories: categoriesRes.rows,
      taxes: taxesRes.rows,
      channel,
      settings: DEFAULT_DEMO_SALES_SETTINGS,
      stockItems: stockRes.rows,
      semiItems: semiRes.rows
    });

    console.log('Generator configured. Starting bulk generation...');

    let totalSalesCreated = 0;
    let totalLinesCreated = 0;
    let totalPaymentsCreated = 0;
    let totalMovementsCreated = 0;
    let totalRevenueCreated = 0;

    // Loop through each branch and day
    for (const branch of branchContexts) {
      console.log(`\n--- Processing Branch: ${branch.branchName} (${branch.branchId}) ---`);
      
      for (const dateStr of dates) {
        const startAt = `${dateStr}T00:00:00+03:00`;
        const endAt = `${dateStr}T23:59:59+03:00`;

        // 1. Check if demo sales already exist for this branch-day
        const demoCheck = await client.query(`
          SELECT count(*) as count FROM sales
          WHERE integration_ref = 'demo-sales-tool'
            AND branch_id = $1
            AND sale_datetime >= $2::timestamptz
            AND sale_datetime <= $3::timestamptz
        `, [branch.branchId, startAt, endAt]);

        const demoCount = parseInt(demoCheck.rows[0].count, 10);
        if (demoCount > 0) {
          console.log(`[SKIP] ${dateStr}: Already has ${demoCount} demo sales.`);
          continue;
        }

        // 2. Check for manual sales to subtract
        const manualCheck = await client.query(`
          SELECT count(*) as count FROM sales
          WHERE (integration_ref IS NULL OR integration_ref != 'demo-sales-tool')
            AND branch_id = $1
            AND sale_datetime >= $2::timestamptz
            AND sale_datetime <= $3::timestamptz
        `, [branch.branchId, startAt, endAt]);

        const manualCount = parseInt(manualCheck.rows[0].count, 10);

        console.log(`[GEN] ${dateStr}: Checking status... Manual sales count: ${manualCount}`);

        // 3. Generate receipts for this day
        const receipts = buildBranchDayReceipts({
          branch,
          isoDay: dateStr,
          existingCount: manualCount,
          generator
        });

        if (receipts.length === 0) {
          console.log(`[GEN] ${dateStr}: No new receipts generated (manual sales might satisfy targets).`);
          continue;
        }

        const salesRows = receipts.map(r => r.header);
        const saleLineRows = receipts.flatMap(r => r.lines);
        const paymentRows = receipts.flatMap(r => r.payments);
        const movementCandidates = receipts.flatMap(r => r.movementCandidates || []);

        // Map candidates to movement rows
        const balanceState = new Map();
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

        // 4. Save to DB under single transaction
        try {
          await client.query('BEGIN');
          await client.query('ALTER TABLE inventory_movements DISABLE TRIGGER ALL');

          await insertRows(client, 'sales', salesRows, 20);
          await insertRows(client, 'sale_lines', saleLineRows, 40);
          await insertRows(client, 'sale_payments', paymentRows, 30);
          await insertRows(client, 'inventory_movements', movementRows, 60);

          await client.query('ALTER TABLE inventory_movements ENABLE TRIGGER ALL');
          await client.query('COMMIT');

          const dayRevenue = salesRows.reduce((sum, r) => sum + Number(r.gross_total_after_discount), 0);
          console.log(`[SUCCESS] ${dateStr}: Created ${salesRows.length} sales, ${movementRows.length} movements, revenue: ${dayRevenue.toFixed(2)} TRY`);

          totalSalesCreated += salesRows.length;
          totalLinesCreated += saleLineRows.length;
          totalPaymentsCreated += paymentRows.length;
          totalMovementsCreated += movementRows.length;
          totalRevenueCreated += dayRevenue;

        } catch (dbErr) {
          console.error(`Database error while processing ${branch.branchName} on ${dateStr}:`, dbErr);
          await client.query('ROLLBACK').catch(() => {});
          throw dbErr; // Stop execution on error
        }
      }
    }

    console.log('\n======================================');
    console.log('BULK GENERATION COMPLETE');
    console.log(`- Total Sales Created: ${totalSalesCreated}`);
    console.log(`- Total Sale Lines Created: ${totalLinesCreated}`);
    console.log(`- Total Payments Created: ${totalPaymentsCreated}`);
    console.log(`- Total Inventory Movements Created: ${totalMovementsCreated}`);
    console.log(`- Total Gross Revenue: ${totalRevenueCreated.toFixed(2)} TRY`);
    console.log('======================================');

  } catch (err) {
    console.error('Fatal execution error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
