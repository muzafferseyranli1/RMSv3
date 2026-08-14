import { db } from '../src/lib/db.js';
import { matchingEngine } from '../src/lib/eInvoice/matchingEngine.js';

async function testAllInvoices() {
  console.log('Testing end-to-end invoice matching & approval...');

  const { data: invoices } = await db
    .from('e_invoices')
    .select('*')
    .eq('is_matched', false)
    .order('created_at', { ascending: false })
    .limit(3);

  console.log(`Found ${invoices?.length || 0} unmatched invoices.`);

  for (const invoice of (invoices || [])) {
    const { data: lines } = await db.from('e_invoice_lines').select('*').eq('invoice_id', invoice.id);
    invoice.lines = lines || [];

    const matchRes = await matchingEngine.findPotentialReceiptsForInvoice(invoice);
    console.log(`Invoice ${invoice.invoice_number}: ${matchRes.candidateReceipts?.length || 0} candidate receipts.`);

    if (matchRes.candidateReceipts && matchRes.candidateReceipts.length > 0) {
      const topCand = matchRes.candidateReceipts[0];
      const approveRes = await matchingEngine.approveInvoiceReceiptMatch({
        invoiceId: invoice.id,
        receiptId: topCand.receipt.id,
        matchData: topCand.comparison,
        userPin: 'ADMIN',
        note: 'Automated test approval',
      });
      console.log(`Approval for ${invoice.invoice_number}:`, approveRes.success ? '✅ SUCCESS' : `❌ FAILED: ${approveRes.error}`);
    }
  }
}

testAllInvoices().catch(console.error);
