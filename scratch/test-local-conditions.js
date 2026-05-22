import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const requireFromProject = createRequire(path.resolve(projectRoot, 'package.json'));
const jiti = requireFromProject('jiti');

const loader = jiti(projectRoot, {
  alias: {
    '@': path.resolve(projectRoot, 'src')
  },
  esmResolve: true
});

// Load posLoyalty and loyaltyRuntimeStatus
const posLoyalty = loader('./src/lib/posLoyalty.js');
const loyaltyRuntimeStatus = loader('./src/lib/loyaltyRuntimeStatus.js');

let failedTests = 0;
let passedTests = 0;

function assert(condition, message, details) {
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${message}`);
    if (details) console.error('Details:', details);
  }
}

function runTests() {
  console.log('--- Starting Local Condition Evaluation Tests ---');

  // Verify status mapping in loyaltyRuntimeStatus
  const itemQtyConfig = loyaltyRuntimeStatus.CONDITION_KEY_STATUS.order_item_quantity;
  assert(itemQtyConfig.category === 'local', 'order_item_quantity category should be local', itemQtyConfig);

  const orderTotalConfig = loyaltyRuntimeStatus.CONDITION_KEY_STATUS.order_total;
  assert(orderTotalConfig.category === 'local', 'order_total category should be local', orderTotalConfig);

  // Mock order context
  const mockOrderContext = {
    orderTotal: 350.0,
    cartLines: [
      { productId: 'prod-pizza-margherita', qty: 2, lineGrossAfterDiscount: 200.0, topCategoryId: 'cat-pizza' },
      { productId: 'prod-cola', qty: 3, lineGrossAfterDiscount: 90.0, topCategoryId: 'cat-beverage' },
      { productId: 'prod-free-cookie', qty: 1, lineGrossAfterDiscount: 0.0, topCategoryId: 'cat-dessert' }
    ],
    saleTemplates: [
      {
        id: 'tmpl-drinks',
        name: 'İçecek Şablonu',
        sale_ids: ['prod-cola', 'prod-water']
      }
    ]
  };

  // Helper function alias
  const evaluate = posLoyalty.evaluateSingleCondition || posLoyalty.default?.evaluateSingleCondition;
  if (!evaluate) {
    console.error('evaluateSingleCondition not found in posLoyalty exports!');
    process.exit(1);
  }

  // --- Test Set 1: order_total (Sipariş tutarı) ---
  console.log('\n--- Evaluating order_total ---');

  // 1a. Basic threshold check (no masks)
  const condTotal1 = {
    conditionKey: 'order_total',
    conditionConfig: { amount: 300, operator: 'gte', productMasks: [] }
  };
  let resTotal1 = evaluate(condTotal1, mockOrderContext);
  assert(resTotal1.matched === true, 'order_total: total 350 >= 300 should match');

  const condTotal2 = {
    conditionKey: 'order_total',
    conditionConfig: { amount: 400, operator: 'gte', productMasks: [] }
  };
  let resTotal2 = evaluate(condTotal2, mockOrderContext);
  assert(resTotal2.matched === false, 'order_total: total 350 >= 400 should not match');

  // 1b. Masked threshold check (pizzas only >= 150)
  const condTotalMask1 = {
    conditionKey: 'order_total',
    conditionConfig: {
      amount: 150,
      operator: 'gte',
      productMasks: [{ type: 'category', itemId: 'cat-pizza', name: 'Pizza Kategori' }]
    }
  };
  let resTotalMask1 = evaluate(condTotalMask1, mockOrderContext);
  assert(resTotalMask1.matched === true, 'order_total with category mask: pizza amount 200 >= 150 should match');

  // 1c. Masked threshold check (pizzas only >= 250)
  const condTotalMask2 = {
    conditionKey: 'order_total',
    conditionConfig: {
      amount: 250,
      operator: 'gte',
      productMasks: [{ type: 'category', itemId: 'cat-pizza', name: 'Pizza Kategori' }]
    }
  };
  let resTotalMask2 = evaluate(condTotalMask2, mockOrderContext);
  assert(resTotalMask2.matched === false, 'order_total with category mask: pizza amount 200 >= 250 should not match');


  // --- Test Set 2: order_item_quantity (Sipariş edilen ürün miktarı) ---
  console.log('\n--- Evaluating order_item_quantity ---');

  // 2a. Simple quantity check (all items, including free and duplicates)
  const condQty1 = {
    conditionKey: 'order_item_quantity',
    conditionConfig: {
      quantity: 5,
      operator: 'gte',
      excludeFreeItems: false,
      allowSameItemRepeat: true,
      productMasks: []
    }
  };
  let resQty1 = evaluate(condQty1, mockOrderContext);
  assert(resQty1.matched === true, 'order_item_quantity: total qty 2 + 3 + 1 = 6 >= 5 should match');

  // 2b. Simple quantity check with excludeFreeItems = true (excludes prod-free-cookie)
  const condQty2 = {
    conditionKey: 'order_item_quantity',
    conditionConfig: {
      quantity: 6,
      operator: 'gte',
      excludeFreeItems: true,
      allowSameItemRepeat: true,
      productMasks: []
    }
  };
  let resQty2 = evaluate(condQty2, mockOrderContext);
  assert(resQty2.matched === false, 'order_item_quantity: qty excluding free items is 5, should not match >= 6');

  // 2c. Simple quantity check with allowSameItemRepeat = false (distinct items count only)
  const condQty3 = {
    conditionKey: 'order_item_quantity',
    conditionConfig: {
      quantity: 3,
      operator: 'gte',
      excludeFreeItems: false,
      allowSameItemRepeat: false,
      productMasks: []
    }
  };
  let resQty3 = evaluate(condQty3, mockOrderContext);
  assert(resQty3.matched === true, 'order_item_quantity: distinct item types count is 3 (pizza, cola, cookie), should match >= 3');

  const condQty4 = {
    conditionKey: 'order_item_quantity',
    conditionConfig: {
      quantity: 4,
      operator: 'gte',
      excludeFreeItems: false,
      allowSameItemRepeat: false,
      productMasks: []
    }
  };
  let resQty4 = evaluate(condQty4, mockOrderContext);
  assert(resQty4.matched === false, 'order_item_quantity: distinct item types count is 3, should not match >= 4');

  // 2d. Filtered quantity check with template mask (drinks)
  const condQtyMask1 = {
    conditionKey: 'order_item_quantity',
    conditionConfig: {
      quantity: 3,
      operator: 'gte',
      excludeFreeItems: false,
      allowSameItemRepeat: true,
      productMasks: [{ type: 'sale_template', itemId: 'tmpl-drinks', name: 'Drinks Template' }]
    }
  };
  let resQtyMask1 = evaluate(condQtyMask1, mockOrderContext);
  assert(resQtyMask1.matched === true, 'order_item_quantity with template mask: cola qty 3 >= 3 should match');

  const condQtyMask2 = {
    conditionKey: 'order_item_quantity',
    conditionConfig: {
      quantity: 4,
      operator: 'gte',
      excludeFreeItems: false,
      allowSameItemRepeat: true,
      productMasks: [{ type: 'sale_template', itemId: 'tmpl-drinks', name: 'Drinks Template' }]
    }
  };
  let resQtyMask2 = evaluate(condQtyMask2, mockOrderContext);
  assert(resQtyMask2.matched === false, 'order_item_quantity with template mask: cola qty 3 >= 4 should not match');

  console.log(`\n--- Local Condition Tests Finished ---`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
