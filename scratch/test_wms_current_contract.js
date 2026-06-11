import { calculateWarehouseDemand } from '../src/lib/warehouseDemandPlanning.js';
import { buildInventoryBalanceRows } from '../src/lib/branchPurchasing.js';

console.log("Running WMS current contract and helper tests...");

// Test Case 1: calculateWarehouseDemand in "tahmin" mode
try {
  const stockItems = [
    { id: 'item-1', name: 'Hamburger Ekmeği', sku: 'HE-01', unit: 'Adet', purchase_price: 2.50, min_stock: 100 }
  ];
  const connectedBranches = [
    { id: 'branch-1', name: 'Kadıköy Şubesi' },
    { id: 'branch-2', name: 'Beşiktaş Şubesi' }
  ];
  
  const multiBranchBalances = new Map([
    ['branch-1:item-1', 20],
    ['branch-2:item-1', 30]
  ]);
  
  const warehouseBalances = new Map([
    ['item-1', 150]
  ]);
  
  const multiBranchDailyUsageMap = new Map([
    ['branch-1:item-1', 10],
    ['branch-2:item-1', 15]
  ]);

  const result = calculateWarehouseDemand({
    warehouseBranchId: 'depot-1',
    flow: { qty_mode: 'tahmin', forecast_ratio: 1.0 },
    stockItems,
    connectedBranches,
    planningDays: 5,
    multiBranchBalances,
    warehouseBalances,
    inboundWarehouseQtyMap: new Map(),
    outboundReplenishingQtyMap: new Map(),
    multiBranchDailyUsageMap,
    multiBranchRecipeForecastMap: new Map(),
    lastOrderQtyMap: new Map(),
    warehouseLastOrderQtyMap: new Map(),
    warehouseSettingsMap: new Map(),
  });

  // branch-1 need: gross = 10 * 5 = 50. coverage = 20. net = 30.
  // branch-2 need: gross = 15 * 5 = 75. coverage = 30. net = 45.
  // total net branch demand = 30 + 45 = 75.
  // safety stock = 0. warehousePosition = 150.
  // suggestedQty = max(75 + 0 - 150, 0) = 0.
  
  if (result.length !== 1) throw new Error("Expected exactly one result row");
  const row = result[0];
  if (row.calculated_need !== 75) throw new Error(`Expected calculated need to be 75, got ${row.calculated_need}`);
  if (row.suggested_qty !== 0) throw new Error(`Expected suggested qty to be 0, got ${row.suggested_qty}`);
  
  console.log("✅ [PASS] calculateWarehouseDemand - tahmin mode");
} catch (err) {
  console.error("❌ [FAIL] calculateWarehouseDemand - tahmin mode:", err.message);
  process.exit(1);
}

// Test Case 2: calculateWarehouseDemand in "stok" mode
try {
  const stockItems = [
    { id: 'item-1', name: 'Hamburger Ekmeği', sku: 'HE-01', unit: 'Adet', purchase_price: 2.50, max_stock: 500 }
  ];
  
  const warehouseBalances = new Map([
    ['item-1', 150]
  ]);
  
  const result = calculateWarehouseDemand({
    warehouseBranchId: 'depot-1',
    flow: { qty_mode: 'stok' },
    stockItems,
    connectedBranches: [],
    planningDays: 5,
    multiBranchBalances: new Map(),
    warehouseBalances,
    inboundWarehouseQtyMap: new Map(),
    outboundReplenishingQtyMap: new Map(),
    multiBranchDailyUsageMap: new Map(),
    multiBranchRecipeForecastMap: new Map(),
    lastOrderQtyMap: new Map(),
    warehouseLastOrderQtyMap: new Map(),
    warehouseSettingsMap: new Map([
      ['item-1', { min_stock: 100, safety_stock: 50 }]
    ]),
  });

  // target = max_stock (500)
  // suggestedQty = target (500) - current (150) = 350.
  
  if (result.length !== 1) throw new Error("Expected exactly one result row");
  const row = result[0];
  if (row.suggested_qty !== 350) throw new Error(`Expected suggested qty to be 350, got ${row.suggested_qty}`);
  
  console.log("✅ [PASS] calculateWarehouseDemand - stok mode");
} catch (err) {
  console.error("❌ [FAIL] calculateWarehouseDemand - stok mode:", err.message);
  process.exit(1);
}

// Test Case 3: buildInventoryBalanceRows with availability status
try {
  const movements = [
    { stock_item_id: 'item-1', quantity: 15, direction: 'in', balance_qty_after: 135, meta: { availability_status: 'putaway_pending' } },
    { stock_item_id: 'item-1', quantity: 20, direction: 'in', balance_qty_after: 120, meta: { availability_status: 'quarantine' } },
    { stock_item_id: 'item-1', quantity: 100, direction: 'in', balance_qty_after: 100, meta: { availability_status: 'available' } },
  ];
  
  const result = buildInventoryBalanceRows(movements);
  if (result.length !== 1) throw new Error("Expected exactly one result row");
  
  const row = result[0];
  if (row.balance_qty_after !== 135) throw new Error(`Expected physical stock to be 135, got ${row.balance_qty_after}`);
  if (row.quarantine_qty !== 20) throw new Error(`Expected quarantine to be 20, got ${row.quarantine_qty}`);
  if (row.putaway_pending_qty !== 15) throw new Error(`Expected putaway pending to be 15, got ${row.putaway_pending_qty}`);
  if (row.available_qty !== 100) throw new Error(`Expected available qty to be 100, got ${row.available_qty}`);
  
  console.log("✅ [PASS] buildInventoryBalanceRows status partitioning");
} catch (err) {
  console.error("❌ [FAIL] buildInventoryBalanceRows:", err.message);
  process.exit(1);
}

console.log("All current WMS contract tests passed successfully!");
