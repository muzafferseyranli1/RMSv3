const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

// Mock implementation of parseJsonValue and resolveLineSupplierId in Node environment
function parseJsonValue(value, fallback = []) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

function resolveLineSupplierId(item, flowSupplierId, allSuppliers = []) {
  if (!item) return flowSupplierId;
  const list = parseJsonValue(item.suppliers_list, []);
  const def = list.find(s => s.is_default || s.is_default === true)?.supp_id;
  if (def && allSuppliers.some(s => String(s.id).toLowerCase() === String(def).toLowerCase())) return def;
  if (item.supp_id && allSuppliers.some(s => String(s.id).toLowerCase() === String(item.supp_id).toLowerCase())) return item.supp_id;

  if (flowSupplierId && list.some(s => String(s.supp_id).toLowerCase() === String(flowSupplierId).toLowerCase())) {
    if (allSuppliers.some(s => String(s.id).toLowerCase() === String(flowSupplierId).toLowerCase())) {
      return flowSupplierId;
    }
  }

  const firstValid = list.find(s => allSuppliers.some(x => String(x.id).toLowerCase() === String(s.supp_id).toLowerCase()))?.supp_id;
  if (firstValid) return firstValid;

  return item.supp_id || flowSupplierId;
}

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Database successfully.');

    // 1. Fetch Suppliers
    const suppliersRes = await client.query('SELECT id, name, supplier_kind FROM public.suppliers WHERE active = true;');
    const suppliers = suppliersRes.rows;
    console.log(`Fetched ${suppliers.length} active suppliers.`);

    // 2. Fetch Stock Items
    const stockItemsRes = await client.query('SELECT id, name, supp_id, suppliers_list FROM public.stock_items WHERE deleted_at IS NULL;');
    const stockItems = stockItemsRes.rows;
    console.log(`Fetched ${stockItems.length} stock items.`);

    // 3. Fetch Order Flows
    const flowsRes = await client.query('SELECT id, name, supplier_id, urun_tipi, selected_stocks FROM public.order_flows WHERE deleted_at IS NULL LIMIT 5;');
    const flows = flowsRes.rows;
    console.log(`Fetched ${flows.length} order flows to inspect.\n`);

    for (const flow of flows) {
      console.log(`--------------------------------------------------`);
      console.log(`Flow: "${flow.name}" (ID: ${flow.id})`);
      console.log(`Flow Primary Supplier ID: ${flow.supplier_id}`);
      console.log(`Items Mode: ${flow.urun_tipi}`);

      let matchedItems = [];
      if (flow.urun_tipi === 'all') {
        matchedItems = stockItems;
      } else if (flow.urun_tipi === 'sec' || flow.urun_tipi === 'sablon') {
        const stockIds = parseJsonValue(flow.selected_stocks, []);
        matchedItems = stockItems.filter(item => stockIds.includes(item.id));
      } else {
        matchedItems = stockItems; // fallback
      }

      console.log(`Items associated with flow: ${matchedItems.length}`);

      // Apply resolution and group by supplier
      const groupings = {};
      for (const item of matchedItems) {
        const resolvedSupId = resolveLineSupplierId(item, flow.supplier_id, suppliers);
        if (!groupings[resolvedSupId]) {
          groupings[resolvedSupId] = [];
        }
        groupings[resolvedSupId].push(item.name);
      }

      console.log('Split breakdown:');
      for (const [supId, items] of Object.entries(groupings)) {
        const supplier = suppliers.find(s => String(s.id).toLowerCase() === String(supId).toLowerCase());
        const supplierName = supplier ? supplier.name : 'Unknown';
        const supplierKind = supplier ? supplier.supplier_kind : 'external';
        console.log(`  -> Supplier: "${supplierName}" (Kind: ${supplierKind}, ID: ${supId})`);
        console.log(`     Count: ${items.length} items`);
        console.log(`     Sample Items: ${items.slice(0, 3).join(', ')}${items.length > 3 ? '...' : ''}`);
      }
    }

  } catch (err) {
    console.error('Error during test execution:', err);
  } finally {
    await client.end();
  }
}

main();
