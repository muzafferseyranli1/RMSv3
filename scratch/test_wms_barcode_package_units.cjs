const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
function loadServerEnv() {
  const envPath = path.join(__dirname, '../server/.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadServerEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}

async function runTests() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected to database successfully.\n");

  let mockStockItemId = null;
  let mockBranchId = '11111111-1111-1111-1111-111111111111'; // Dummy branch UUID
  let mockLocationId = null;
  let mockLpnId = null;
  let mockBarcodeIds = [];

  try {
    // 0. Set up database mock entries if needed (e.g. branch/company_node)
    const branchRes = await client.query("SELECT id FROM public.company_nodes LIMIT 1");
    if (branchRes.rows.length > 0) {
      mockBranchId = branchRes.rows[0].id;
    } else {
      const insertBranch = await client.query(
        "INSERT INTO public.company_nodes (name, type) VALUES ('WMS Test Branch', 'sube') RETURNING id"
      );
      mockBranchId = insertBranch.rows[0].id;
    }

    // 1. Create a mock stock_item
    console.log("1. Creating mock stock item...");
    const sku = 'WMS-TEST-SKU-' + Date.now();
    const stockItemRes = await client.query(
      `INSERT INTO public.stock_items (sku, name, unit, packaging_units) 
       VALUES ($1, 'WMS Test Product', 'Adet', '[]'::jsonb) 
       RETURNING id`,
      [sku]
    )
    mockStockItemId = stockItemRes.rows[0].id;
    console.log(`Mock stock item created with ID: ${mockStockItemId}, SKU: ${sku}`);

    // Verify trigger automatically created base unit row in stock_item_package_units
    console.log("Checking base unit creation...");
    let unitsRes = await client.query(
      "SELECT id, unit_name, base_quantity, is_base_unit, active FROM public.stock_item_package_units WHERE stock_item_id = $1",
      [mockStockItemId]
    );
    console.log("Initial package units list:");
    console.log(unitsRes.rows);
    if (unitsRes.rows.length !== 1 || !unitsRes.rows[0].is_base_unit || unitsRes.rows[0].unit_name !== 'Adet') {
      throw new Error("Trigger failed to create base unit correctly!");
    }
    console.log("✔ Base unit correctly synchronized.\n");

    // 2. Update stock item packaging_units JSONB array
    console.log("2. Updating packaging_units array on stock item...");
    const packagingUnitsJson = [
      { id: 'u1', unit: 'kutu', qty: 10 },  // 1 kutu = 10 Adet
      { id: 'u2', unit: 'koli', qty: 5 }     // 1 koli = 5 kutu = 50 Adet
    ];
    await client.query(
      "UPDATE public.stock_items SET packaging_units = $1 WHERE id = $2",
      [JSON.stringify(packagingUnitsJson), mockStockItemId]
    );

    // Verify trigger synchronized package units
    unitsRes = await client.query(
      "SELECT id, unit_name, base_quantity, is_base_unit, active FROM public.stock_item_package_units WHERE stock_item_id = $1 ORDER BY level_no ASC",
      [mockStockItemId]
    );
    console.log("Updated package units list:");
    console.log(unitsRes.rows);
    if (unitsRes.rows.length !== 3) {
      throw new Error("Trigger did not synchronize all package units!");
    }
    // Check conversions
    const kutuRow = unitsRes.rows.find(r => r.unit_name === 'kutu');
    const koliRow = unitsRes.rows.find(r => r.unit_name === 'koli');
    if (!kutuRow || Number(kutuRow.base_quantity) !== 10) throw new Error("Conversion for 'kutu' is wrong!");
    if (!koliRow || Number(koliRow.base_quantity) !== 50) throw new Error("Conversion for 'koli' is wrong!");
    console.log("✔ Hierarchical conversions correctly synchronized.\n");

    // Test generated volume column by setting dimensions on 'koli' unit
    console.log("Testing generated volume column...");
    await client.query(
      "UPDATE public.stock_item_package_units SET length_cm = 10, width_cm = 20, height_cm = 30 WHERE id = $1",
      [koliRow.id]
    );
    const volumeRes = await client.query(
      "SELECT volume_m3 FROM public.stock_item_package_units WHERE id = $1",
      [koliRow.id]
    );
    const volumeVal = Number(volumeRes.rows[0].volume_m3);
    console.log(`Calculated volume_m3 for (10x20x30): ${volumeVal}`);
    if (volumeVal !== 0.006) {
      throw new Error(`Calculated volume is incorrect! Expected 0.006, got ${volumeVal}`);
    }
    console.log("✔ Volume auto-generated column works.\n");

    // 3. Test active barcode unique index (fail-closed)
    console.log("3. Testing active barcode unique index...");
    const barcodeStr = 'WMS-TEST-BARCODE-' + Date.now();
    
    // Insert first active barcode
    const bar1 = await client.query(
      `INSERT INTO public.product_external_barcodes (gtin_barcode, stock_item_id, package_unit_id, active, is_approved)
       VALUES ($1, $2, $3, true, true) RETURNING id`,
      [barcodeStr, mockStockItemId, kutuRow.id]
    );
    mockBarcodeIds.push(bar1.rows[0].id);
    console.log(`First active barcode inserted.`);

    // Try inserting duplicate active barcode (should fail)
    try {
      await client.query(
        `INSERT INTO public.product_external_barcodes (gtin_barcode, stock_item_id, package_unit_id, active, is_approved)
         VALUES ($1, $2, $3, true, true)`,
        [barcodeStr, mockStockItemId, koliRow.id]
      );
      throw new Error("Duplicate active barcode was inserted successfully! Index failed.");
    } catch (err) {
      if (err.message.includes('unique constraint') || err.message.includes('duplicate key')) {
        console.log("✔ Duplicate active barcode insertion failed as expected (unique constraint triggered).");
      } else {
        throw err;
      }
    }

    // Insert duplicate inactive barcode (should succeed)
    const bar2 = await client.query(
      `INSERT INTO public.product_external_barcodes (gtin_barcode, stock_item_id, package_unit_id, active, is_approved)
       VALUES ($1, $2, $3, false, true) RETURNING id`,
      [barcodeStr, mockStockItemId, koliRow.id]
    );
    mockBarcodeIds.push(bar2.rows[0].id);
    console.log("✔ Duplicate inactive barcode inserted successfully without unique constraint violation.");
    console.log("✔ Partial unique barcode constraint works perfectly.\n");

    // 4. Test server parse-barcode sequence
    console.log("4. Testing parse-barcode sequence internal queries...");
    
    // Setup location and LPN mock data for testing priority
    const locationCode = 'LOC-WMS-TEST';
    const lpnCode = 'LPN-WMS-TEST';

    const locInsert = await client.query(
      `INSERT INTO public.warehouse_locations (branch_id, zone_code, aisle, rack, level, bin, is_active)
       VALUES ($1, 'WMS-TEST', '1', '2', '3', '4', true) RETURNING id`,
      [mockBranchId]
    );
    mockLocationId = locInsert.rows[0].id;
    console.log(`Mock Location created with ID: ${mockLocationId}`);

    const lpnInsert = await client.query(
      `INSERT INTO public.warehouse_lpns (lpn_code, branch_id, status)
       VALUES ($1, $2, 'active') RETURNING id`,
      [lpnCode, mockBranchId]
    );
    mockLpnId = lpnInsert.rows[0].id;
    console.log(`Mock LPN created with ID: ${mockLpnId}`);

    console.log("\nTesting resolution helpers logic:");
    
    // Test resolveProductByApprovedBarcode
    const resolvedApproved = await client.query(
      `SELECT s.id AS stock_item_id, s.name, p.package_unit_id
       FROM public.product_external_barcodes p
       JOIN public.stock_items s ON p.stock_item_id = s.id
       WHERE p.gtin_barcode = $1 AND p.is_approved = true AND p.active = true`,
      [barcodeStr]
    );
    console.log("resolveProductByApprovedBarcode returns:", resolvedApproved.rows);
    if (resolvedApproved.rows.length !== 1 || resolvedApproved.rows[0].package_unit_id !== kutuRow.id) {
      throw new Error("resolveProductByApprovedBarcode query logic is incorrect!");
    }
    console.log("✔ resolveProductByApprovedBarcode query logic verified.");

    // Test resolveProductBySku
    const resolvedSku = await client.query(
      "SELECT id, name, sku FROM public.stock_items WHERE sku = $1 AND deleted_at IS NULL",
      [sku]
    );
    console.log("resolveProductBySku returns:", resolvedSku.rows);
    if (resolvedSku.rows.length !== 1 || resolvedSku.rows[0].id !== mockStockItemId) {
      throw new Error("resolveProductBySku query logic is incorrect!");
    }
    console.log("✔ resolveProductBySku query logic verified.");

    console.log("\nAll tests passed successfully!");

  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    // Clean up
    console.log("\nCleaning up mock data...");
    if (mockBarcodeIds.length > 0) {
      await client.query("DELETE FROM public.product_external_barcodes WHERE id = ANY($1)", [mockBarcodeIds]);
    }
    if (mockLpnId) {
      await client.query("DELETE FROM public.warehouse_lpns WHERE id = $1", [mockLpnId]);
    }
    if (mockLocationId) {
      await client.query("DELETE FROM public.warehouse_locations WHERE id = $1", [mockLocationId]);
    }
    if (mockStockItemId) {
      await client.query("DELETE FROM public.stock_items WHERE id = $1", [mockStockItemId]);
    }
    await client.end();
    console.log("Cleanup done, DB connection closed.");
  }
}

runTests();
