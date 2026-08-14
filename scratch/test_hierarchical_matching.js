import { matchingEngine } from '../src/lib/eInvoice/matchingEngine.js';
import { db } from '../src/lib/db.js';

async function testHierarchy() {
  console.log('=== TESTING 5-STAGE HIERARCHICAL MATCHING & SUPPLIER MAPPINGS ===\n');

  // Create mock invoice and receipt
  const mockInvoice = {
    id: 'test-inv-001',
    invoice_number: 'TEST-INV-2026-001',
    sender_vkn_tckn: '3248921839',
    sender_title: 'Horeca Süt ve Peynir Dağıtım A.Ş.',
    payable_amount: 107624.0,
    lines: [
      {
        id: 'line-01',
        item_name: 'çedar peynr', // <--- Differing name!
        item_code: 'HRC-CDR-99',
        invoiced_quantity: 48000.0,
        unit_price: 0.82,
        tax_rate: 10,
        total_line_amount: 43296.0,
      },
      {
        id: 'line-02',
        item_name: 'Mozzarella',
        item_code: 'STK-SG-02',
        invoiced_quantity: 40000.0,
        unit_price: 1.15,
        tax_rate: 10,
        total_line_amount: 50600.0,
      },
    ],
  };

  const mockReceipt = {
    id: 'test-rcpt-001',
    receipt_no: 'DEMO-MK-202605-002',
    supplier_name: 'Horeca Süt ve Peynir Dağıtım A.Ş.',
    total_amount_vat_inc: 107624.0,
    lines: [
      {
        id: 'rcpt-line-01',
        stock_item_id: 'stock-cheddar-uuid',
        item_name: 'Cheddar Peyniri', // <--- RMS standard name
        item_sku: 'STK-SG-01',
        received_qty: 48000.0,
        unit_price: 0.82,
        vat_rate: 0.1,
        line_total_vat_inc: 43296.0,
      },
      {
        id: 'rcpt-line-02',
        stock_item_id: 'stock-mozzarella-uuid',
        item_name: 'Mozzarella',
        item_sku: 'STK-SG-02',
        received_qty: 40000.0,
        unit_price: 1.15,
        vat_rate: 0.1,
        line_total_vat_inc: 50600.0,
      },
    ],
  };

  // Test 1: Stage 3 (Unique Qty & Price match)
  console.log('--- TEST 1: Initial Match (No Memory yet) ---');
  const comp1 = matchingEngine.compareInvoiceWithReceipt(mockInvoice, mockReceipt, {
    supplierMappings: [],
  });

  console.log('Overall Match Score:', comp1.matchScore);
  console.log('Line 1 Match Method:', comp1.lineComparisons[0].matchMethod, '| Label:', comp1.lineComparisons[0].matchMethodLabel);
  console.log('Line 2 Match Method:', comp1.lineComparisons[1].matchMethod, '| Label:', comp1.lineComparisons[1].matchMethodLabel);

  if (comp1.lineComparisons[0].matchMethod === 'UNIQUE_QTY_PRICE') {
    console.log('✅ TEST 1 PASSED: "çedar peynr" successfully auto-linked via Unique Qty & Price!\n');
  } else {
    console.error('❌ TEST 1 FAILED:', comp1.lineComparisons[0]);
  }

  // Test 2: Stage 2 (With Learned Memory)
  console.log('--- TEST 2: Second Match (With Learned Memory in supplier_item_mappings) ---');
  const mockSupplierMappings = [
    {
      supplier_id: 'supp-horeca-uuid',
      supplier_item_name: 'çedar peynr',
      stock_item_id: 'stock-cheddar-uuid',
      mapping_source: 'AUTO_QTY_PRICE',
      confidence_score: 95,
    },
  ];

  const comp2 = matchingEngine.compareInvoiceWithReceipt(mockInvoice, mockReceipt, {
    supplierMappings: mockSupplierMappings,
  });

  console.log('Line 1 Match Method:', comp2.lineComparisons[0].matchMethod, '| Label:', comp2.lineComparisons[0].matchMethodLabel);
  if (comp2.lineComparisons[0].matchMethod === 'MAPPED_MEMORY') {
    console.log('✅ TEST 2 PASSED: "çedar peynr" matched instantly via Learned Memory (Stage 2)!\n');
  } else {
    console.error('❌ TEST 2 FAILED:', comp2.lineComparisons[0]);
  }
}

testHierarchy().catch(console.error);
