import pg from 'pg';
import { db } from '../src/lib/db.js';
import { matchingEngine } from '../src/lib/eInvoice/matchingEngine.js';
import { generateETTN, generateInvoiceNumber, calculateInvoiceTotals } from '../src/lib/eInvoice/coreUblGenerator.js';

const NEW_PG_URL = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  console.log('--- Testing Fresh Invoice Generation from Purchase Receipt ---');

  // 1. Fetch a real purchase receipt and its lines
  const { data: receipts } = await db.from('purchase_receipts').select('*').limit(1);
  if (!receipts || receipts.length === 0) {
    console.log('No purchase receipts found');
    return;
  }
  const receipt = receipts[0];
  console.log('Receipt:', { id: receipt.id, no: receipt.receipt_no, supp: receipt.supplier_name });

  const { data: rcptLines } = await db.from('purchase_receipt_lines').select('*').eq('receipt_id', receipt.id);
  console.log('Receipt Lines:', rcptLines);

  // 2. Build invoice and invoice lines
  const invoiceEttn = generateETTN();
  const invoiceNumber = generateInvoiceNumber('ENT', new Date().getFullYear(), Math.floor(100000 + Math.random() * 899999));
  const docRef = receipt.receipt_no || receipt.doc_no || 'MK-TEST-001';

  const invoiceLines = rcptLines.map((l, idx) => ({
    line_number: idx + 1,
    item_name: l.item_name || 'Ice Tea Konsantrat',
    item_code: l.item_sku || '',
    invoiced_quantity: Number(l.delivered_qty || l.received_qty || 100),
    unit_code: l.unit || 'LTR',
    unit_price: Number(l.unit_price || 0.28),
    subtotal: Number(l.delivered_qty || 100) * Number(l.unit_price || 0.28),
    tax_rate: 1,
    tax_amount: (Number(l.delivered_qty || 100) * Number(l.unit_price || 0.28)) * 0.01,
    total_line_amount: (Number(l.delivered_qty || 100) * Number(l.unit_price || 0.28)) * 1.01,
    matched_stock_item_id: l.stock_item_id || null,
  }));

  const totals = calculateInvoiceTotals(invoiceLines, 0, 0);

  const invoicePayload = {
    direction: 'INBOUND',
    ettn: invoiceEttn,
    invoice_number: invoiceNumber,
    invoice_type: 'SATIS',
    profile_id: 'TICARIFATURA',
    issue_date: '2026-08-15',
    status_code: 1200,
    status_description: 'Alıcıya Ulaştı (3-Way Matching Bekliyor)',
    currency_code: 'TRY',
    sender_vkn_tckn: '3248921839',
    sender_title: receipt.supplier_name || 'Metro İçecek Dağıtım A.Ş.',
    receiver_vkn_tckn: '1234567890',
    receiver_title: 'SuitableRMS Restoran Grubu A.Ş.',
    line_extension_amount: totals.lineExtensionAmount,
    tax_exclusive_amount: totals.taxExclusiveAmount,
    tax_inclusive_amount: totals.taxInclusiveAmount,
    tax_total_amount: totals.taxTotalAmount,
    payable_amount: totals.payableAmount,
    despatch_document_reference: docRef,
    source_transfer_doc_no: docRef,
    is_matched: false,
    notes: 'Tam Uyumlu Test Faturası',
  };

  const { data: savedArr, error: insErr } = await db.from('e_invoices').insert(invoicePayload).select('*');
  if (insErr) {
    console.error('Invoice insert error:', insErr);
    return;
  }
  const savedInvoice = Array.isArray(savedArr) ? savedArr[0] : (savedArr || invoicePayload);
  const targetId = savedInvoice?.id || invoiceEttn;
  console.log('Saved Invoice in DB:', { id: targetId, no: savedInvoice?.invoice_number });

  // Insert lines
  const linesToInsert = invoiceLines.map(l => ({ ...l, invoice_id: targetId }));
  const { error: lineInsErr } = await db.from('e_invoice_lines').insert(linesToInsert);
  if (lineInsErr) {
    console.error('Line insert error:', lineInsErr);
    return;
  }
  console.log('Lines successfully inserted into e_invoice_lines!');

  // Now run matchingEngine on this savedInvoice
  console.log('\n--- Running matchingEngine.compareInvoiceWithReceipt ---');
  const fullInv = { ...savedInvoice, id: targetId, lines: linesToInsert };
  const comp = await matchingEngine.compareInvoiceWithReceipt(fullInv, receipt);
  console.log('Match result:', {
    overallScore: comp.overallScore,
    isFullyMatched: comp.isFullyMatched,
    lineMatchesCount: comp.lineMatches?.length,
    discrepanciesCount: comp.discrepancies?.length,
    lineMatches: comp.lineMatches,
  });
}

main().catch(console.error);
