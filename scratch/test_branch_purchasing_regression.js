import {
  computeSuggestedQuantity,
  resolveBranchLineSupplierId,
  resolveWarehouseTransferPrice,
  stockItemHasInternalWarehouseSupplier,
} from '../src/lib/branchPurchasing.js';

const testCases = [
  // 1. Tahmin mode - target based (stockTarget > 0)
  {
    name: 'Tahmin mode - Target based (reorder > 0)',
    inputs: {
      item: { reorder: 50, daily_usage: 5 },
      flow: { qty_mode: 'tahmin' },
      currentQty: 20,
      coverageDays: 7,
      lastOrderQty: 10,
      forecastRatio: 1.2
    },
    expected: {
      calculatedNeed: 42, // daily_usage (5) * ratio (1.2) * coverageDays (7) = 42.
      suggestedQty: 30,
      forecastRatio: 1.2
    }
  },
  // 2. Tahmin mode - usage based (no stock target)
  {
    name: 'Tahmin mode - Usage based (no stock target)',
    inputs: {
      item: { daily_usage: 4 },
      flow: { qty_mode: 'tahmin' },
      currentQty: 10,
      coverageDays: 5,
      lastOrderQty: 0,
      forecastRatio: 1.5
    },
    expected: {
      calculatedNeed: 30, // daily_usage (4) * ratio (1.5) * coverageDays (5) = 30. needQty = 30. stockTarget = 0. suggestedQty = max(30 - 10, 0) = 20.
      suggestedQty: 20,
      forecastRatio: 1.5
    }
  },
  // 3. Stok mode
  {
    name: 'Stok mode',
    inputs: {
      item: { reorder: 40, daily_usage: 2 },
      flow: { qty_mode: 'stok' },
      currentQty: 15,
      coverageDays: 6,
      lastOrderQty: 5,
      forecastRatio: 1.1
    },
    expected: {
      calculatedNeed: 25, // stockGapQty = max(40 - 15, 0) = 25. needQty = 25. suggestedQty = 25.
      suggestedQty: 25,
      forecastRatio: 1
    }
  },
  // 4. Son mode
  {
    name: 'Son mode',
    inputs: {
      item: { reorder: 30, daily_usage: 3 },
      flow: { qty_mode: 'son' },
      currentQty: 8,
      coverageDays: 4,
      lastOrderQty: 12,
      forecastRatio: 1.3
    },
    expected: {
      calculatedNeed: 12, // needQty = repeatedQty = 12. suggestedQty = 12.
      suggestedQty: 12,
      forecastRatio: 1
    }
  },
  // 5. Manuel mode
  {
    name: 'Manuel mode',
    inputs: {
      item: { reorder: 25, daily_usage: 3 },
      flow: { qty_mode: 'manuel' },
      currentQty: 5,
      coverageDays: 7,
      lastOrderQty: 15,
      forecastRatio: 1.2
    },
    expected: {
      calculatedNeed: 21, // needQty = defaultNeedQty = 3 * 1 * 7 = 21 (ratio is 1 for non-tahmin). suggestedQty = 0.
      suggestedQty: 0,
      forecastRatio: 1
    }
  },
  // 6. Rounding with packaging unit
  {
    name: 'Rounding with packaging unit and min order',
    inputs: {
      item: { daily_usage: 2, order_unit: 'koli', packaging_units: JSON.stringify([{ unit: 'koli', qty: 6 }]), min_order: 2 },
      flow: { qty_mode: 'tahmin', round_box_qty: true, round_min_qty: true, round_box_threshold: 0.1 },
      currentQty: 2,
      coverageDays: 5,
      lastOrderQty: 0,
      forecastRatio: 1.0
    },
    expected: {
      // Need = 2 * 1 * 5 = 10. stockTarget = 0. suggested = max(10 - 2, 0) = 8.
      // factor = 6. minBaseQty = 2 * 6 = 12.
      // packageCount = 8/6 = 1.33 >= 0.1 threshold -> rounds up to 2 packages = 12.
      // round_min_qty: minBaseQty is 12, rounded is 12. Max(12, 12) = 12.
      calculatedNeed: 10,
      suggestedQty: 12,
      forecastRatio: 1
    }
  }
];

let failed = false;

console.log('Running branch purchasing regression tests...');
for (const tc of testCases) {
  const output = computeSuggestedQuantity(tc.inputs);
  const matchCalculatedNeed = Math.abs(output.calculatedNeed - tc.expected.calculatedNeed) < 0.0001;
  const matchSuggestedQty = Math.abs(output.suggestedQty - tc.expected.suggestedQty) < 0.0001;
  const matchForecastRatio = Math.abs(output.forecastRatio - tc.expected.forecastRatio) < 0.0001;

  if (matchCalculatedNeed && matchSuggestedQty && matchForecastRatio) {
    console.log(`✅ [PASS] ${tc.name}`);
  } else {
    console.error(`❌ [FAIL] ${tc.name}`);
    console.error(`  Expected:`, tc.expected);
    console.error(`  Actual:`, output);
    failed = true;
  }
}

const suppliers = [
  { id: 'supplier-unmas', name: 'Unmaş', supplier_kind: 'external' },
  { id: 'supplier-main-warehouse', name: 'Merkez Depo', supplier_kind: 'internal_warehouse' },
];

const warehouseManagedItem = {
  id: 'hamburger-bun',
  name: 'Hamburger Ekmeği',
  supp_id: 'supplier-unmas',
  suppliers_list: [
    { supp_id: 'supplier-unmas', is_default: true },
    { supp_id: 'supplier-main-warehouse' },
  ],
};

const externalOnlyItem = {
  id: 'paper-cup',
  name: 'Karton Bardak',
  supp_id: 'supplier-unmas',
  suppliers_list: [{ supp_id: 'supplier-unmas', is_default: true }],
};

if (!stockItemHasInternalWarehouseSupplier(warehouseManagedItem, suppliers)) {
  console.error('❌ [FAIL] Warehouse supplier detection');
  failed = true;
} else {
  console.log('✅ [PASS] Warehouse supplier detection');
}

const resolvedWarehouseSupplier = resolveBranchLineSupplierId(warehouseManagedItem, 'supplier-unmas', suppliers);
if (resolvedWarehouseSupplier !== 'supplier-main-warehouse') {
  console.error('❌ [FAIL] Branch supplier routing prefers internal warehouse');
  console.error(`  Expected: supplier-main-warehouse`);
  console.error(`  Actual: ${resolvedWarehouseSupplier}`);
  failed = true;
} else {
  console.log('✅ [PASS] Branch supplier routing prefers internal warehouse');
}

const resolvedExternalSupplier = resolveBranchLineSupplierId(externalOnlyItem, 'supplier-unmas', suppliers);
if (resolvedExternalSupplier !== 'supplier-unmas') {
  console.error('❌ [FAIL] External-only supplier routing stays external');
  console.error(`  Expected: supplier-unmas`);
  console.error(`  Actual: ${resolvedExternalSupplier}`);
  failed = true;
} else {
  console.log('✅ [PASS] External-only supplier routing stays external');
}

const percentTransferPrice = resolveWarehouseTransferPrice(10, {
  transfer_price_adjustment_type: 'percent',
  transfer_price_adjustment_value: 10,
});
if (!percentTransferPrice.applied || Math.abs(percentTransferPrice.unit_price - 11) > 0.0001) {
  console.error('FAIL Warehouse transfer percent margin price');
  console.error(`  Expected: 11`);
  console.error(`  Actual: ${percentTransferPrice.unit_price}`);
  failed = true;
} else {
  console.log('PASS Warehouse transfer percent margin price');
}

const amountTransferPrice = resolveWarehouseTransferPrice(10, {
  transfer_price_adjustment_type: 'amount',
  transfer_price_adjustment_value: 1,
});
if (!amountTransferPrice.applied || Math.abs(amountTransferPrice.unit_price - 11) > 0.0001) {
  console.error('FAIL Warehouse transfer amount margin price');
  console.error(`  Expected: 11`);
  console.error(`  Actual: ${amountTransferPrice.unit_price}`);
  failed = true;
} else {
  console.log('PASS Warehouse transfer amount margin price');
}

if (failed) {
  process.exit(1);
} else {
  console.log('\nAll branch purchasing regression tests passed successfully!');
  process.exit(0);
}
