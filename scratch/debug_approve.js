import { db } from '../src/lib/db.js';
import { matchingEngine } from '../src/lib/eInvoice/matchingEngine.js';

async function testApprove() {
  console.log('Testing invoice approval...\n');

  const { data: invoices } = await db
    .from('e_invoices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  const invoice = invoices[0];
  console.log('Target Invoice:', invoice.id, invoice.invoice_number, invoice.sender_title);

  // Fetch lines
  const { data: lines } = await db.from('e_invoice_lines').select('*').eq('invoice_id', invoice.id);
  invoice.lines = lines || [];

  const candidateRes = await matchingEngine.findPotentialReceiptsForInvoice(invoice);
  console.log('Candidates found:', candidateRes.candidateReceipts?.length);

  const activeCand = candidateRes.candidateReceipts[0];
  console.log('Target Receipt:', activeCand?.receipt?.id, activeCand?.receipt?.receipt_no);

  const res = await matchingEngine.approveInvoiceReceiptMatch({
    invoiceId: invoice.id,
    receiptId: activeCand.receipt.id,
    matchData: activeCand.comparison,
    userPin: 'ADMIN',
    note: 'Test approval from script',
  });

  console.log('Approve result:', res);
}

testApprove().catch(console.error);
